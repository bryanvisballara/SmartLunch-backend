const crypto = require('crypto');
const express = require('express');
const { resolveGradeCourses, gradeHasCourse, normalizeGradeCourseKey } = require('../utils/academicGradeCourses');
const { getFeeGradeAliases, findGradeFeeSetting, canonicalizeGradeFeeSettingsForStructure, resolveAcademicStructureGradeKey, findAcademicStructureGradeForStudent } = require('../utils/feeGradeMatching');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const multer = require('multer');
const XLSX = require('xlsx');
const { OpenAI } = require('openai');

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const AcademicCharge = require('../models/academicCharge.model');
const AcademicChargePayment = require('../models/academicChargePayment.model');
const AcademicBillingFollowUp = require('../models/academicBillingFollowUp.model');
const AcademicCommunication = require('../models/academicCommunication.model');
const AcademicCommunicationAuthor = require('../models/academicCommunicationAuthor.model');
const AcademicCommunicationRequest = require('../models/academicCommunicationRequest.model');
const AcademicCalendarAssignment = require('../models/academicCalendarAssignment.model');
const AcademicGradePromotionRequest = require('../models/academicGradePromotionRequest.model');
const AcademicFeeConfiguration = require('../models/academicFeeConfiguration.model');
const AcademicStructure = require('../models/academicStructure.model');
const SchoolCreationSnapshot = require('../models/schoolCreationSnapshot.model');
const CampusCourse = require('../models/campusCourse.model');
const CampusSchoolRoute = require('../models/campusSchoolRoute.model');
const ParentStudentLink = require('../models/parentStudentLink.model');
const Student = require('../models/student.model');
const StudentBillingProfile = require('../models/studentBillingProfile.model');
const User = require('../models/user.model');
const EnrollmentMatriculaProcess = require('../models/enrollmentMatriculaProcess.model');
const PaymentTransaction = require('../models/paymentTransaction.model');
const { ensureStudentWallet } = require('../utils/studentWallet');
const { upsertStudentAccount } = require('../utils/studentAccount');
const { queueNotificationsForParents, queueStudentParentNotification } = require('../services/notification.service');
const { buildParentPushUrl } = require('../utils/parentPushTargets');
const { isMillenniumSchoolId } = require('../utils/millenniumSchool');
const {
  applyMonthlyTuitionAdditionalDiscount,
  hasMonthlyTuitionAdditionalDiscount,
  normalizeAdditionalPensionDiscount,
} = require('../utils/academicAdditionalPensionDiscount');
const {
  linkCarteraPaymentToEnrollmentMatricula,
  unlinkCarteraPaymentFromEnrollmentMatricula,
} = require('../services/enrollmentMatricula.service');
const { createBillingPaymentDeletionRequest } = require('../services/enrollmentMatriculaPurgeRequest.service');
const { sendAcademicBillingEmail, sendAcademicCommunicationEmail } = require('../services/brevo.service');
const {
  normalizeStoredImageUrl,
  validateIncomingImageUrl,
  uploadImageMiddleware,
  processAndStoreUploadedImage,
  isCloudinaryEnabled,
} = require('../utils/imageUpload');
const {
  uploadCampusMaterialsMiddleware,
  processStoredCampusMaterialFiles,
} = require('../utils/campusMaterialUpload');

const router = express.Router();
const uploadAcademicCommunicationImage = uploadImageMiddleware.single('image');
const uploadAcademicCommunicationMedia = uploadCampusMaterialsMiddleware.single('file');
const openAiClient = String(process.env.OPENAI_API_KEY || '').trim()
  ? new OpenAI({ apiKey: String(process.env.OPENAI_API_KEY || '').trim() })
  : null;
const uploadAcademicDatabaseMigrationFile = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
}).single('file');

const ACADEMIC_SECRETARY_FULL_ACCESS_ROLES = ['academic_secretary', 'admin', 'rectoria', 'direccion'];
const ACADEMIC_BILLING_ACCESS_ROLES = ['billing', 'admin', 'rectoria', 'direccion'];
const ACADEMIC_COMMUNICATION_EMAIL_DELIVERY_ENABLED = false;
const ACADEMIC_SECRETARY_FEE_SETTINGS_ROLES = ['academic_secretary', 'billing', 'admin', 'rectoria', 'direccion'];
const ACADEMIC_ADMISSIONS_READ_ROLES = ['admissions'];
const ACADEMIC_COORDINATION_READ_ROLES = ['coordination'];
const ACADEMIC_COURSE_ASSIGNMENT_ROLES = [...ACADEMIC_SECRETARY_FULL_ACCESS_ROLES, 'coordination'];
const ACADEMIC_COMMUNICATION_MANAGEMENT_ROLES = [...ACADEMIC_SECRETARY_FULL_ACCESS_ROLES, 'coordination'];
const ACADEMIC_CALENDAR_ASSIGNMENT_ROLES = [...ACADEMIC_SECRETARY_FULL_ACCESS_ROLES, 'coordination'];
const SCHOOL_CREATION_DEFAULT_GRADES_BY_LEVEL = {
  preescolar: ['Prejardin', 'Jardin', 'Transicion'],
  primaria: ['1', '2', '3', '4', '5'],
  secundaria: ['6', '7', '8', '9'],
  media: ['10', '11'],
};

router.use(authMiddleware);
router.use((req, res, next) => {
  const method = String(req.method || '').toUpperCase();
  const isFeeSettingsRoute = req.path === '/fee-settings';
  const isBootstrapRoute = req.path === '/bootstrap' && method === 'GET';
  const isCommunicationManagementRoute = /^\/communications(\/|$)/.test(req.path)
    || /^\/communication-authors(\/|$)/.test(req.path)
    || /^\/communication-requests(\/|$)/.test(req.path);
  const isCalendarAssignmentRoute = /^\/academic-management\/assignments(\/|$)/.test(req.path);
  const isCourseAssignmentRoute = /^\/academic-management\/students\/[^/]+\/course$/.test(req.path) && method === 'PATCH';
  const isEnrollmentRoute = req.path === '/enrollments' && method === 'POST';
  const isAcademicDatabaseAccessRoute = (req.path === '/database' && method === 'GET')
    || (/^\/database\/[^/]+$/.test(req.path) && method === 'PATCH');
  const isBillingAccessRoute = (req.path === '/billing' && method === 'GET')
    || (req.path === '/billing/payments' && method === 'GET')
    || (req.path === '/billing/charges' && method === 'POST')
    || (/^\/billing\/charges\/[^/]+\/pay$/.test(req.path) && method === 'POST')
    || (/^\/billing\/payments\/[^/]+$/.test(req.path) && method === 'DELETE')
    || (/^\/billing\/students\/[^/]+\/pension-discount$/.test(req.path) && method === 'PATCH')
    || (req.path === '/billing/reminders' && method === 'POST')
    || (req.path === '/billing/follow-ups' && method === 'POST');

  if (isFeeSettingsRoute && method === 'GET') {
    return roleMiddleware([...ACADEMIC_SECRETARY_FEE_SETTINGS_ROLES, ...ACADEMIC_ADMISSIONS_READ_ROLES])(req, res, next);
  }

  if (isFeeSettingsRoute && method === 'PUT') {
    return roleMiddleware(ACADEMIC_SECRETARY_FEE_SETTINGS_ROLES)(req, res, next);
  }

  if (isBootstrapRoute) {
    return roleMiddleware([...ACADEMIC_SECRETARY_FULL_ACCESS_ROLES, ...ACADEMIC_BILLING_ACCESS_ROLES, ...ACADEMIC_COORDINATION_READ_ROLES, ...ACADEMIC_ADMISSIONS_READ_ROLES])(req, res, next);
  }

  if (isCommunicationManagementRoute) {
    return roleMiddleware(ACADEMIC_COMMUNICATION_MANAGEMENT_ROLES)(req, res, next);
  }

  if (isCalendarAssignmentRoute) {
    return roleMiddleware(ACADEMIC_CALENDAR_ASSIGNMENT_ROLES)(req, res, next);
  }

  if (isCourseAssignmentRoute) {
    return roleMiddleware(ACADEMIC_COURSE_ASSIGNMENT_ROLES)(req, res, next);
  }

  if (isBillingAccessRoute) {
    return roleMiddleware([...ACADEMIC_SECRETARY_FULL_ACCESS_ROLES, ...ACADEMIC_BILLING_ACCESS_ROLES])(req, res, next);
  }

  if (isEnrollmentRoute || isAcademicDatabaseAccessRoute) {
    return roleMiddleware([...ACADEMIC_SECRETARY_FULL_ACCESS_ROLES, ...ACADEMIC_ADMISSIONS_READ_ROLES])(req, res, next);
  }

  return roleMiddleware(ACADEMIC_SECRETARY_FULL_ACCESS_ROLES)(req, res, next);
});

function normalizeText(value) {
  return String(value || '').trim();
}

function persistAcademicCommunicationImageUpload(req, res, { folder = 'communications-feed' } = {}) {
  uploadAcademicCommunicationImage(req, res, async (error) => {
    if (error) {
      return res.status(400).json({ message: error.message || 'No se pudo cargar la imagen del comunicado.' });
    }

    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ message: 'No se recibio ningun archivo.' });
      }

      const preferredName = normalizeText(req.body?.preferredName) || normalizeText(req.file?.originalname) || 'comunicado';
      const saved = await processAndStoreUploadedImage({
        file: req.file,
        folder,
        preferredName,
        requireCloudinary: isCloudinaryEnabled(),
      });

      if (isCloudinaryEnabled() && (saved.storage !== 'cloudinary' || !/^https?:\/\//i.test(saved.url || ''))) {
        return res.status(503).json({ message: 'No se pudo guardar la imagen. Intenta de nuevo en unos segundos.' });
      }

      if (!/^https?:\/\//i.test(saved.url || '') && !String(saved.url || '').startsWith('/assets/')) {
        return res.status(503).json({ message: 'No se pudo guardar la imagen. Intenta de nuevo en unos segundos.' });
      }

      const thumbUrl = /^https?:\/\//i.test(saved.thumbUrl || '') ? saved.thumbUrl : saved.url;

      return res.status(201).json({
        kind: 'image',
        url: saved.url,
        imageUrl: saved.url,
        videoUrl: '',
        thumbUrl,
        storage: saved.storage || 'local',
      });
    } catch (requestError) {
      return res.status(400).json({ message: requestError.message || 'No se pudo guardar la imagen del comunicado.' });
    }
  });
}

router.post('/communications/feed-image', (req, res) => {
  return persistAcademicCommunicationImageUpload(req, res, { folder: 'communications-feed' });
});

router.post('/communications/uploads/image', (req, res) => {
  return persistAcademicCommunicationImageUpload(req, res, { folder: 'academic-communications' });
});

function normalizeAcademicStudentMedicalProfile(value = {}) {
  const rawProfile = value && typeof value === 'object' ? value : {};
  const rawAuthorization = rawProfile.medicationAuthorization && typeof rawProfile.medicationAuthorization === 'object'
    ? rawProfile.medicationAuthorization
    : {};
  const rawStatus = normalizeText(rawAuthorization.status || rawProfile.medicationAuthorizationStatus).toLowerCase();
  const status = ['authorized', 'not_authorized'].includes(rawStatus) ? rawStatus : '';

  return {
    allergies: normalizeText(rawProfile.allergies),
    chronicConditions: normalizeText(rawProfile.chronicConditions),
    currentMedications: normalizeText(rawProfile.currentMedications),
    dietaryRestrictions: normalizeText(rawProfile.dietaryRestrictions),
    healthInsurance: normalizeText(rawProfile.healthInsurance),
    emergencyMedicalContactName: normalizeText(rawProfile.emergencyMedicalContactName),
    emergencyMedicalContactPhone: normalizeText(rawProfile.emergencyMedicalContactPhone),
    physicianName: normalizeText(rawProfile.physicianName),
    physicianPhone: normalizeText(rawProfile.physicianPhone),
    medicationAuthorization: {
      status,
      authorizedBy: normalizeText(rawAuthorization.authorizedBy || rawProfile.medicationAuthorizationResponsible),
      authorizedMedications: normalizeText(rawAuthorization.authorizedMedications || rawProfile.authorizedMedications),
      instructions: normalizeText(rawAuthorization.instructions || rawProfile.medicationInstructions),
      notes: normalizeText(rawAuthorization.notes || rawProfile.medicationAuthorizationNotes),
      authorizationDate: rawAuthorization.authorizationDate ? new Date(rawAuthorization.authorizationDate) : new Date(),
    },
    completedAt: new Date(),
  };
}

function getAcademicStudentMedicalProfileErrors(profile, studentLabel) {
  const errors = [];
  const prefix = studentLabel ? `${studentLabel}: ` : '';
  if (!profile.allergies) errors.push(`${prefix}registra alergias o escribe Ninguna.`);
  if (!profile.chronicConditions) errors.push(`${prefix}registra condiciones medicas o escribe Ninguna.`);
  if (!profile.currentMedications) errors.push(`${prefix}registra medicamentos actuales o escribe Ninguno.`);
  if (!profile.emergencyMedicalContactName) errors.push(`${prefix}registra contacto medico de emergencia.`);
  if (!profile.emergencyMedicalContactPhone) errors.push(`${prefix}registra telefono del contacto medico.`);
  if (!profile.medicationAuthorization.status) errors.push(`${prefix}selecciona la autorizacion de medicamentos.`);
  if (!profile.medicationAuthorization.authorizedBy) errors.push(`${prefix}registra quien firma la autorizacion de medicamentos.`);
  if (profile.medicationAuthorization.status === 'authorized' && !profile.medicationAuthorization.authorizedMedications) {
    errors.push(`${prefix}registra los medicamentos autorizados.`);
  }
  if (profile.medicationAuthorization.status === 'authorized' && !profile.medicationAuthorization.instructions) {
    errors.push(`${prefix}registra las instrucciones de medicamentos autorizados.`);
  }
  return errors;
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeArray(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map((item) => normalizeText(item)).filter(Boolean)));
}

function uniqueNormalizedValues(values) {
  return normalizeArray(values);
}

async function ensureCurrentUserPassword(req, password) {
  const normalizedPassword = String(password || '');
  if (!normalizedPassword) {
    return { ok: false, status: 400, message: 'Debes confirmar tu clave para continuar.' };
  }

  const currentUser = await User.findOne({
    _id: req.user.userId,
    schoolId: req.user.schoolId,
    status: 'active',
    deletedAt: null,
  }).select('passwordHash');

  if (!currentUser?.passwordHash) {
    return { ok: false, status: 404, message: 'No se pudo validar el usuario actual.' };
  }

  const passwordMatches = await bcrypt.compare(normalizedPassword, currentUser.passwordHash);
  if (!passwordMatches) {
    return { ok: false, status: 401, message: 'La clave ingresada no es correcta.' };
  }

  return { ok: true };
}

function extractAcademicGradeLevel(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return '';
  }

  if (/^\d{1,2}$/.test(normalized)) {
    return normalized;
  }

  const normalizedLetters = normalized
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (normalizedLetters.includes('prejardin')) return 'Prejardin';
  if (normalizedLetters.includes('jardin')) return 'Jardin';
  if (normalizedLetters.includes('transicion')) return 'Transicion';

  if (/[a-z]/i.test(normalized)) {
    return slugifyAcademicStructureKey(normalized);
  }

  const leadingNumericMatch = normalized.match(/^(\d{1,2})/);
  if (leadingNumericMatch) {
    return leadingNumericMatch[1];
  }

  return slugifyAcademicStructureKey(normalized) || normalized;
}

function getAcademicCourseSectionFromKey(courseKey = '') {
  const parts = normalizeText(courseKey).split(':').map((part) => part.trim()).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : '';
}

function buildAcademicCourseDisplayLabel(grade = {}, course = {}, siblingCourses = []) {
  const gradeLabel = normalizeText(grade.label || grade.key);
  const courseLabel = normalizeText(course.label || course.section || course.key);
  const section = normalizeText(course.section || getAcademicCourseSectionFromKey(course.key)).toUpperCase();
  const siblingSections = (Array.isArray(siblingCourses) ? siblingCourses : [])
    .map((item) => normalizeText(item?.section || getAcademicCourseSectionFromKey(item?.key) || item?.label).toUpperCase())
    .filter(Boolean);
  const hasLetteredSibling = siblingSections.some((item) => /^[0-9]+[A-Z]$/.test(item) || /^[A-Z]$/.test(item));

  if (!courseLabel) {
    return gradeLabel;
  }

  if (gradeLabel && courseLabel.toLowerCase() === gradeLabel.toLowerCase() && hasLetteredSibling) {
    return `${gradeLabel}A`;
  }

  if (gradeLabel && /^[0-9]+[A-Z]$/.test(section)) {
    return section;
  }

  if (!gradeLabel || courseLabel.toLowerCase().startsWith(gradeLabel.toLowerCase())) {
    return courseLabel;
  }

  const suffix = section || courseLabel;
  if (/^[a-z0-9]$/i.test(suffix)) {
    return `${gradeLabel}${suffix}`;
  }

  return `${gradeLabel} ${courseLabel}`.trim();
}

function buildTeacherCommunicationAuthorName(request = {}) {
  const teacherName = normalizeText(request.teacherUserId?.name || request.teacherName || request.teacherUserId?.username) || 'Docente';
  const subjectLabel = normalizeText(request.courseId?.subject)
    || normalizeText(request.courseTitle).split(' - ')[0]
    || normalizeText(request.courseTitle);

  return subjectLabel ? `${teacherName} - ${subjectLabel}` : teacherName;
}

function buildAcademicStructureCourseOptions(serializedAcademicStructure = { grades: [] }) {
  return (Array.isArray(serializedAcademicStructure.grades) ? serializedAcademicStructure.grades : [])
    .flatMap((grade) => resolveGradeCourses(grade).map((course) => {
      const courses = resolveGradeCourses(grade);
      const label = buildAcademicCourseDisplayLabel(grade, course, courses);
      const aliases = [course.key, course.label, course.section, label]
        .map(normalizeText)
        .filter(Boolean);

      return {
        value: normalizeText(course.key || label),
        label,
        gradeKey: normalizeText(grade.key),
        gradeLabel: normalizeText(grade.label || grade.key),
        section: normalizeText(course.section),
        aliases: Array.from(new Set(aliases)),
        source: 'academic-structure',
      };
    }))
    .filter((course) => course.value && course.label)
    .sort((left, right) => left.label.localeCompare(right.label, 'es', { numeric: true }));
}

function buildAcademicCourseTargetResolvers(serializedAcademicStructure = { grades: [] }) {
  const resolverMap = new Map();
  buildAcademicStructureCourseOptions(serializedAcademicStructure).forEach((course) => {
    const keys = [course.value, course.label, ...(Array.isArray(course.aliases) ? course.aliases : [])]
      .map(normalizeText)
      .filter(Boolean);
    keys.forEach((key) => {
      resolverMap.set(key, course);
    });
  });
  return resolverMap;
}

function normalizeCommunicationMedia(mediaItems) {
  if (!Array.isArray(mediaItems)) {
    return [];
  }

  const normalizedMedia = mediaItems
    .map((item) => {
      const kind = normalizeText(item?.kind).toLowerCase() === 'video' ? 'video' : 'image';
      const src = kind === 'image'
        ? normalizeStoredImageUrl(item?.src)
        : validateIncomingImageUrl(item?.src || '');
      const thumbUrl = kind === 'image'
        ? normalizeStoredImageUrl(item?.thumbUrl || item?.src)
        : normalizeStoredImageUrl(item?.thumbUrl || '');

      if (!src) {
        return null;
      }

      return {
        kind,
        src,
        thumbUrl,
        alt: normalizeText(item?.alt),
      };
    })
    .filter(Boolean)
    .slice(0, 8);

  assertCommunicationMediaUrls(normalizedMedia);
  return normalizedMedia;
}

function assertCommunicationMediaUrls(mediaItems = []) {
  for (const item of mediaItems) {
    const src = normalizeText(item?.src);
    if (!src) {
      continue;
    }

    if (isCloudinaryEnabled() && (src.startsWith('/assets/') || src.startsWith('/uploads/'))) {
      throw new Error('Vuelve a subir las imagenes del comunicado antes de publicar.');
    }

    const kind = normalizeText(item?.kind).toLowerCase();
    if (kind === 'image' && isCloudinaryEnabled() && !/res\.cloudinary\.com\//i.test(src)) {
      throw new Error('Vuelve a subir las imagenes del comunicado antes de publicar.');
    }
  }
}

function buildAcademicSecretaryAiFallback({ kind, sourceTitle, sourceBody }) {
  const title = normalizeText(sourceTitle);
  const body = normalizeText(sourceBody);

  const normalizeSentence = (value) => {
    const compact = normalizeText(value).replace(/\s+/g, ' ');
    if (!compact) return '';
    const next = compact.charAt(0).toUpperCase() + compact.slice(1);
    return /[.!?]$/.test(next) ? next : `${next}.`;
  };

  const toSpanishTitleCase = (value) => String(value || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => {
      if (index > 0 && ['de', 'del', 'la', 'las', 'el', 'los', 'y', 'para', 'con', 'en'].includes(word)) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ')
    .trim();

  const extractDateLabel = (value) => {
    const match = String(value || '').toLowerCase().match(/\b(\d{1,2}\s+de\s+[a-záéíóúñ]+)\b/);
    if (!match) return '';
    return match[1].replace(/\s+/g, ' ').trim();
  };

  const improveTitle = (value, supportBody) => {
    const rawBase = normalizeText(value) || normalizeText(supportBody).split(/[.!?\n]/)[0].trim();
    const dateLabel = extractDateLabel(`${value} ${supportBody}`);
    const withoutDate = rawBase
      .replace(/\b(?:el|este)\s+\d{1,2}\s+de\s+[a-záéíóúñ]+\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    let improvedCore = withoutDate;
    if (/^dia del emprendimiento/i.test(withoutDate)) {
      improvedCore = 'Feria de Emprendimiento Estudiantil';
    } else if (/^reunion de padres/i.test(withoutDate) || /^reunión de padres/i.test(withoutDate)) {
      improvedCore = 'Reunión de Padres de Familia';
    } else if (/^entrega de boletines/i.test(withoutDate)) {
      improvedCore = 'Entrega de Boletines Académicos';
    } else if (/^acto civico/i.test(withoutDate) || /^acto cívico/i.test(withoutDate)) {
      improvedCore = 'Acto Cívico Institucional';
    } else if (/^salida pedagogica/i.test(withoutDate) || /^salida pedagógica/i.test(withoutDate)) {
      improvedCore = 'Salida Pedagógica Institucional';
    } else {
      improvedCore = toSpanishTitleCase(withoutDate || rawBase || 'Comunicado importante para familias');
    }

    if (dateLabel && !improvedCore.toLowerCase().includes(dateLabel.toLowerCase())) {
      return `${improvedCore} – ${dateLabel}`.slice(0, 120);
    }

    return improvedCore.slice(0, 120);
  };

  if (kind === 'title') {
    return improveTitle(title, body) || 'Comunicado importante para familias';
  }

  if (!body && !title) {
    return 'Estimadas familias,\n\nCompartimos este comunicado con información importante para su seguimiento.\n\nAgradecemos su atención.';
  }

  const polishedBody = normalizeSentence(body || title);
  const improvedTitle = improveTitle(title, body);
  return `Estimadas familias,\n\nLes compartimos información importante relacionada con ${improvedTitle.toLowerCase()}.\n\n${polishedBody}\n\nAgradecemos su atención y apoyo permanente.\n\nCordialmente,\nSecretaría Académica`.trim();
}

function normalizeDateKey(value) {
  if (!value) {
    return '';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return parsed.toISOString().slice(0, 10);
}

function labelAcademicPaymentMethod(method) {
  const normalized = normalizeText(method).toLowerCase();
  if (normalized === 'parent_portal') return 'Portal de acudientes';
  if (normalized === 'cash') return 'Efectivo';
  if (normalized === 'bank_transfer') return 'Transferencia';
  if (normalized === 'card') return 'Tarjeta';
  if (normalized === 'pse') return 'PSE';
  if (normalized === 'epayco') return 'ePayco';
  if (normalized === 'bold') return 'Bold';
  if (normalized === 'wompi') return 'Wompi';
  if (normalized === 'other') return 'Otro';
  return normalized || 'Sin método';
}

function normalizePhoneForWhatsapp(value) {
  const digits = String(value || '').replace(/\D+/g, '');
  if (!digits) {
    return '';
  }

  if (digits.length === 10) {
    return `57${digits}`;
  }

  return digits;
}

function serializeBillingFollowUp(entry) {
  return {
    _id: entry._id,
    parentId: entry.parentId,
    parentName: entry.parentName || 'Acudiente',
    parentPhone: entry.parentPhone || '',
    studentNames: Array.isArray(entry.studentNames) ? entry.studentNames : [],
    outstandingAmount: Number(entry.outstandingAmount || 0),
    overdueDays: Number(entry.overdueDays || 0),
    overdueMonths: Number(entry.overdueMonths || 0),
    actionType: entry.actionType || 'manual_note',
    title: entry.title || '',
    body: entry.body || '',
    whatsappUrl: entry.whatsappUrl || '',
    pushDelivered: Number(entry.pushDelivered || 0),
    pushTokensFound: Number(entry.pushTokensFound || 0),
    emailed: Number(entry.emailed || 0),
    createdByName: entry.createdByName || '',
    createdByRole: entry.createdByRole || '',
    createdAt: entry.createdAt || null,
    updatedAt: entry.updatedAt || null,
  };
}

function serializeCommunicationAuthor(author) {
  return {
    _id: author._id,
    name: author.name || '',
    photoUrl: author.photoUrl || '',
    thumbUrl: author.thumbUrl || author.photoUrl || '',
    isDefault: author.isDefault === true,
    active: author.active !== false,
    createdAt: author.createdAt || null,
    updatedAt: author.updatedAt || null,
  };
}

function normalizeCommunicationLike(like = {}) {
  return {
    userId: String(like.userId || ''),
    name: normalizeText(like.name) || 'Acudiente',
    createdAt: like.createdAt || null,
  };
}

function serializeCommunicationComment(comment = {}) {
  const likes = Array.isArray(comment.likes)
    ? comment.likes.map(normalizeCommunicationLike).filter((like) => like.userId)
    : [];

  return {
    id: String(comment._id || comment.id || ''),
    userId: String(comment.userId || ''),
    name: normalizeText(comment.name) || 'Acudiente',
    body: normalizeText(comment.body),
    createdAt: comment.createdAt || null,
    updatedAt: comment.updatedAt || null,
    likesCount: likes.length,
    likes,
  };
}

function serializeCommunicationForDashboard(communication = {}) {
  const likes = Array.isArray(communication.likes)
    ? communication.likes.map(normalizeCommunicationLike).filter((like) => like.userId)
    : [];
  const comments = Array.isArray(communication.comments)
    ? communication.comments.map(serializeCommunicationComment).filter((comment) => comment.id && comment.body)
    : [];

  return {
    ...communication,
    likesCount: likes.length,
    commentsCount: comments.length,
    likes,
    comments,
  };
}

function serializeAcademicCalendarAssignment(item = {}) {
  return {
    id: String(item._id || item.id || ''),
    title: normalizeText(item.title),
    body: normalizeText(item.body),
    type: normalizeText(item.type) || 'Actividad',
    scheduledAt: item.scheduledAt || null,
    scope: normalizeText(item.scope) || 'all_school',
    targetGradeKeys: Array.isArray(item.targetGradeKeys) ? item.targetGradeKeys.map(normalizeText).filter(Boolean) : [],
    status: normalizeText(item.status) || 'published',
    authorName: normalizeText(item.authorName),
    authorRole: normalizeText(item.authorRole),
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null,
  };
}

function normalizeAcademicCalendarAssignmentPayload(body = {}) {
  const title = normalizeText(body.title);
  const type = normalizeText(body.type) || 'Actividad';
  const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
  const scope = normalizeText(body.scope) === 'grades' ? 'grades' : 'all_school';
  const targetGradeKeys = scope === 'grades'
    ? normalizeArray(body.targetGradeKeys).map(normalizeAcademicStructureGradeKey).filter(Boolean)
    : [];

  return {
    title,
    type,
    body: normalizeText(body.body),
    scheduledAt,
    scope,
    targetGradeKeys: Array.from(new Set(targetGradeKeys)),
  };
}

async function ensureDefaultCommunicationAuthor(schoolId, userId = null) {
  const existingAuthor = await AcademicCommunicationAuthor.findOne({ schoolId, isDefault: true, active: true });
  if (existingAuthor) return existingAuthor;

  return AcademicCommunicationAuthor.create({
    schoolId,
    createdByUserId: toObjectId(userId),
    name: 'Secretaría académica',
    photoUrl: '',
    thumbUrl: '',
    isDefault: true,
  });
}

async function resolveCommunicationAuthor({ schoolId, authorId, authorName, authorPhotoUrl, authorThumbUrl }) {
  const authorObjectId = toObjectId(authorId);
  if (authorObjectId) {
    const author = await AcademicCommunicationAuthor.findOne({ _id: authorObjectId, schoolId, active: true }).lean();
    if (author) {
      return {
        authorId: author._id,
        authorName: author.name || 'Secretaría académica',
        authorPhotoUrl: author.photoUrl || '',
        authorThumbUrl: author.thumbUrl || author.photoUrl || '',
      };
    }
  }

  return {
    authorId: null,
    authorName: normalizeText(authorName) || 'Secretaría académica',
    authorPhotoUrl: normalizeText(authorPhotoUrl),
    authorThumbUrl: normalizeText(authorThumbUrl) || normalizeText(authorPhotoUrl),
  };
}

async function buildBillingFollowUpSummary(schoolId) {
  const entries = await AcademicBillingFollowUp.find({ schoolId })
    .sort({ createdAt: -1, updatedAt: -1 })
    .limit(60)
    .lean();

  return entries.map(serializeBillingFollowUp);
}

async function resolvePrimaryParentContacts(schoolId) {
  const links = await ParentStudentLink.find({ schoolId, status: 'active' }).lean();
  const studentBuckets = new Map();

  links.forEach((link) => {
    const studentId = String(link.studentId || '').trim();
    if (!studentId) {
      return;
    }

    if (!studentBuckets.has(studentId)) {
      studentBuckets.set(studentId, []);
    }

    studentBuckets.get(studentId).push(link);
  });

  const bulkOperations = [];
  const primaryLinkByStudentId = new Map();
  const selectedParentIds = new Set();

  studentBuckets.forEach((studentLinks, studentId) => {
    const explicitPrimary = studentLinks.find((link) => link.isPrimaryContact);
    const motherLink = studentLinks.find((link) => ['mother', 'madre'].includes(normalizeText(link.relationship).toLowerCase()));
    const fatherLink = studentLinks.find((link) => ['father', 'padre'].includes(normalizeText(link.relationship).toLowerCase()));
    const fallbackLink = studentLinks[0] || null;
    const selectedLink = explicitPrimary || motherLink || fatherLink || fallbackLink;

    if (!selectedLink) {
      return;
    }

    primaryLinkByStudentId.set(studentId, selectedLink);
    selectedParentIds.add(String(selectedLink.parentId));

    if (!explicitPrimary) {
      bulkOperations.push({
        updateMany: {
          filter: { schoolId, studentId: selectedLink.studentId },
          update: { $set: { isPrimaryContact: false } },
        },
      });
      bulkOperations.push({
        updateOne: {
          filter: { schoolId, _id: selectedLink._id },
          update: { $set: { isPrimaryContact: true } },
        },
      });
    }
  });

  if (bulkOperations.length > 0) {
    await ParentStudentLink.bulkWrite(bulkOperations, { ordered: false });
  }

  const parents = selectedParentIds.size > 0
    ? await User.find({ schoolId, _id: { $in: Array.from(selectedParentIds) }, role: 'parent', deletedAt: null })
      .select('name email phone')
      .lean()
    : [];

  const parentById = new Map(parents.map((parent) => [String(parent._id), parent]));

  const primaryParentByStudentId = new Map();
  primaryLinkByStudentId.forEach((link, studentId) => {
    const parent = parentById.get(String(link.parentId));
    if (!parent) {
      return;
    }

    primaryParentByStudentId.set(studentId, {
      _id: parent._id,
      name: parent.name || 'Acudiente',
      email: parent.email || '',
      phone: parent.phone || '',
      relationship: link.relationship || 'parent',
    });
  });

  return primaryParentByStudentId;
}

function sameAcademicDueDate(left, right) {
  const leftDate = normalizeAcademicDueDateForBogota(left);
  const rightDate = normalizeAcademicDueDateForBogota(right);
  return Boolean(leftDate && rightDate && leftDate.getTime() === rightDate.getTime());
}

async function syncAnnualTuitionDueDatesFromRectoria({ schoolId, billingProfiles = [], feeConfiguration = null, studentIds = [], referenceDate = new Date() }) {
  const studentIdFilter = new Set(studentIds.map((item) => String(item)).filter(Boolean));
  const profiles = (billingProfiles || []).filter((profile) => {
    const studentId = String(profile?.studentId || '').trim();
    return studentId && (!studentIdFilter.size || studentIdFilter.has(studentId));
  });
  let modifiedCount = 0;

  for (const profile of profiles) {
    const activeDueDate = resolveActiveEnrollmentBenefitDueDate(feeConfiguration || {}, profile.grade || '', referenceDate);
    const firstDueDate = activeDueDate || normalizeAcademicDueDateForBogota(profile.annualTuitionDueDate);
    if (!firstDueDate) {
      continue;
    }

    if (activeDueDate && !sameAcademicDueDate(profile.annualTuitionDueDate, activeDueDate)) {
      await StudentBillingProfile.updateOne(
        { schoolId, _id: profile._id },
        { $set: { annualTuitionDueDate: activeDueDate } }
      );
      profile.annualTuitionDueDate = activeDueDate;
    }

    const charges = await AcademicCharge.find({
      schoolId,
      studentId: profile.studentId,
      category: 'annual_tuition',
      status: { $in: ['pending', 'overdue'] },
    }).sort({ dueDate: 1, createdAt: 1 });

    for (const [installmentIndex, charge] of charges.entries()) {
      const nextDueDate = buildAcademicAnnualTuitionInstallmentDueDate(firstDueDate, installmentIndex);
      if (sameAcademicDueDate(charge.dueDate, nextDueDate)) {
        continue;
      }

      charge.dueDate = nextDueDate;
      await charge.save();
      modifiedCount += 1;
    }
  }

  return modifiedCount;
}

function buildBillingChargeDedupKey(charge, displayParentId) {
  const studentId = String(charge?.studentId?._id || charge?.studentId || '').trim();
  if (!studentId) {
    return String(charge?._id || crypto.randomUUID());
  }

  return [
    studentId,
    displayParentId,
    normalizeText(charge?.category).toLowerCase(),
    normalizeText(charge?.concept).toLowerCase(),
    normalizeDateKey(charge?.dueDate),
    normalizeText(charge?.monthKey).toLowerCase(),
    Number(charge?.originalAmount || charge?.amount || 0),
  ].join('|');
}

async function generateAcademicSecretaryAiSuggestion({ kind, sourceTitle, sourceBody }) {
  const fallback = buildAcademicSecretaryAiFallback({ kind, sourceTitle, sourceBody });

  if (!openAiClient) {
    return fallback;
  }

  const normalizedKind = normalizeText(kind).toLowerCase() === 'body' ? 'body' : 'title';
  const prompt = normalizedKind === 'title'
    ? `Mejora el siguiente título de comunicado escolar para familias. Debe sonar más profesional, claro y atractivo, sin perder la intención original. Si hay una fecha, intégrala de forma elegante. Devuelve solo el título final, sin comillas ni explicaciones.\n\nEjemplo esperado:\nOriginal: dia del emprendimiento el 25 de abril\nMejorado: Feria de Emprendimiento Estudiantil – 25 de abril\n\nTítulo original: ${normalizeText(sourceTitle) || '(vacío)'}\n\nMensaje de apoyo: ${normalizeText(sourceBody) || '(vacío)'}`
    : `Mejora el siguiente comunicado escolar para familias. Debe sonar claro, profesional, cercano y mejor redactado que el original. Conserva la idea central, ordena mejor las frases y devuelve solo el texto final, sin comillas ni explicaciones.\n\nTítulo de apoyo: ${normalizeText(sourceTitle) || '(vacío)'}\n\nMensaje original:\n${normalizeText(sourceBody) || '(vacío)'}`;

  try {
    const response = await openAiClient.responses.create({
      model: String(process.env.OPENAI_MODEL || 'gpt-5-mini').trim(),
      input: prompt,
    });

    const output = normalizeText(response?.output_text || '');
    return output || fallback;
  } catch {
    return fallback;
  }
}

function toObjectId(value) {
  if (!mongoose.Types.ObjectId.isValid(String(value || ''))) {
    return null;
  }

  return new mongoose.Types.ObjectId(String(value));
}

function formatCurrency(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatDateLabel(value) {
  if (!value) {
    return '';
  }

  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function buildMonthKey(dateValue) {
  const date = new Date(dateValue);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getCurrentAcademicYear() {
  return String(new Date().getFullYear());
}

function compareAcademicLabels(left, right) {
  return String(left || '').localeCompare(String(right || ''), 'es', { numeric: true, sensitivity: 'base' });
}

function slugifyAcademicStructureKey(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

function normalizeAcademicStructureGradeKey(value) {
  return extractAcademicGradeLevel(value);
}

function normalizeAcademicStructureLevelKey(value) {
  return slugifyAcademicStructureKey(value);
}

function normalizeAcademicScheduleMatch(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function resolveCoordinationLevelKeys(serializedAcademicStructure = {}, coordinationScope = '') {
  const normalizedScope = normalizeAcademicScheduleMatch(coordinationScope);
  const levels = Array.isArray(serializedAcademicStructure?.levels) ? serializedAcademicStructure.levels : [];

  if (!normalizedScope) {
    return new Set();
  }

  const exactMatches = levels.filter((level) => {
    const levelKey = normalizeAcademicScheduleMatch(level?.key);
    const levelLabel = normalizeAcademicScheduleMatch(level?.label);
    return normalizedScope === levelKey || normalizedScope === levelLabel;
  });

  const matchedLevels = exactMatches.length > 0
    ? exactMatches
    : levels.filter((level) => {
      const levelKey = normalizeAcademicScheduleMatch(level?.key);
      const levelLabel = normalizeAcademicScheduleMatch(level?.label);
      return levelKey.includes(normalizedScope)
        || levelLabel.includes(normalizedScope)
        || normalizedScope.includes(levelKey)
        || normalizedScope.includes(levelLabel);
    });

  return new Set(matchedLevels.map((level) => normalizeText(level?.key)).filter(Boolean));
}

function resolveCoordinationGradeKeys(serializedAcademicStructure = {}, coordinationScope = '') {
  const levelKeys = resolveCoordinationLevelKeys(serializedAcademicStructure, coordinationScope);
  if (levelKeys.size === 0) {
    return { levelKeys, gradeKeys: new Set() };
  }

  const grades = Array.isArray(serializedAcademicStructure?.grades) ? serializedAcademicStructure.grades : [];
  const gradeKeys = new Set(grades
    .filter((grade) => levelKeys.has(normalizeText(grade?.levelKey)))
    .map((grade) => normalizeText(grade?.key))
    .filter(Boolean));

  return { levelKeys, gradeKeys };
}

function filterAcademicStructureForCoordination(serializedAcademicStructure = {}, levelKeys = new Set(), gradeKeys = new Set()) {
  if (levelKeys.size === 0 || gradeKeys.size === 0) {
    return {
      ...serializedAcademicStructure,
      levels: [],
      subjects: [],
      grades: [],
      teachingAvailability: [],
      subjectLoadTemplates: [],
      gradeSchedules: [],
    };
  }

  return {
    ...serializedAcademicStructure,
    levels: (serializedAcademicStructure.levels || []).filter((level) => levelKeys.has(normalizeText(level?.key))),
    subjects: (serializedAcademicStructure.subjects || []).filter((subject) => {
      const subjectGradeKeys = Array.isArray(subject?.gradeKeys) ? subject.gradeKeys.map(normalizeText).filter(Boolean) : [];
      return subjectGradeKeys.length === 0 || subjectGradeKeys.some((gradeKey) => gradeKeys.has(gradeKey));
    }).map((subject) => ({
      ...subject,
      gradeKeys: Array.isArray(subject?.gradeKeys) ? subject.gradeKeys.filter((gradeKey) => gradeKeys.has(normalizeText(gradeKey))) : [],
    })),
    grades: (serializedAcademicStructure.grades || []).filter((grade) => gradeKeys.has(normalizeText(grade?.key))),
    teachingAvailability: (serializedAcademicStructure.teachingAvailability || []).map((item) => ({
      ...item,
      gradeKeys: Array.isArray(item?.gradeKeys) ? item.gradeKeys.filter((gradeKey) => gradeKeys.has(normalizeText(gradeKey))) : [],
    })).filter((item) => Array.isArray(item.gradeKeys) && item.gradeKeys.length > 0),
    subjectLoadTemplates: (serializedAcademicStructure.subjectLoadTemplates || []).map((item) => ({
      ...item,
      gradeKeys: Array.isArray(item?.gradeKeys) ? item.gradeKeys.filter((gradeKey) => gradeKeys.has(normalizeText(gradeKey))) : [],
    })).filter((item) => Array.isArray(item.gradeKeys) && item.gradeKeys.length > 0),
    gradeSchedules: (serializedAcademicStructure.gradeSchedules || []).filter((schedule) => gradeKeys.has(normalizeText(schedule?.gradeKey))),
  };
}

function filterAcademicFeeSettingsByGradeKeys(feeSettings = {}, gradeKeys = new Set()) {
  if (!feeSettings || typeof feeSettings !== 'object') {
    return feeSettings;
  }

  const serializedFeeSettings = feeSettings.toObject ? feeSettings.toObject() : feeSettings;
  const normalizedGradeKeys = new Set(
    [...gradeKeys].flatMap((gradeKey) => getFeeGradeAliases(gradeKey)).filter(Boolean),
  );

  return {
    ...serializedFeeSettings,
    benefitRules: normalizeBenefitRules(serializedFeeSettings.benefitRules || []),
    enrollmentBenefitRules: normalizeEnrollmentBenefitRules(serializedFeeSettings.enrollmentBenefitRules || []),
    gradeSettings: Array.isArray(serializedFeeSettings.gradeSettings)
      ? serializedFeeSettings.gradeSettings.filter((setting) => (
        getFeeGradeAliases(setting?.grade).some((alias) => normalizedGradeKeys.has(alias))
      ))
      : [],
  };
}

function serializeAcademicFeeConfigurationForStructure(configuration, structureGrades = [], options = {}) {
  const serialized = configuration?.toObject ? configuration.toObject() : { ...(configuration || {}) };

  return {
    ...serialized,
    benefitRules: normalizeBenefitRules(serialized.benefitRules || []),
    enrollmentBenefitRules: normalizeEnrollmentBenefitRules(serialized.enrollmentBenefitRules || []),
    gradeSettings: canonicalizeGradeFeeSettingsForStructure(serialized.gradeSettings || [], structureGrades, options),
  };
}

function summarizeGradeFeeSettingsForComparison(gradeSettings = []) {
  return (Array.isArray(gradeSettings) ? gradeSettings : [])
    .map((setting) => ({
      grade: normalizeText(setting?.grade),
      enrollmentFee: normalizeFeeAmount(setting?.enrollmentFee),
      monthlyTuition: normalizeFeeAmount(setting?.monthlyTuition),
      enrollmentBonus: normalizeFeeAmount(setting?.enrollmentBonus),
    }))
    .filter((setting) => setting.grade)
    .sort((left, right) => left.grade.localeCompare(right.grade, 'es'));
}

async function loadSnapshotCostsByGrade(schoolId) {
  const snapshot = await SchoolCreationSnapshot.findOne({ schoolId }).lean();
  const costsByGrade = snapshot?.payload?.financialCostsByGrade;
  return costsByGrade && typeof costsByGrade === 'object' ? costsByGrade : {};
}

function normalizeAcademicStructureSubjectKind(value) {
  return normalizeText(value).toLowerCase() === 'secundaria' ? 'secundaria' : 'principal';
}

function createDefaultAcademicStructurePeriods() {
  return [
    {
      key: 'period_1',
      name: 'Periodo 1',
      weight: 100,
      order: 10,
      startDate: null,
      endDate: null,
    },
  ];
}

const ACADEMIC_SCHEDULE_WEEKDAYS = [1, 2, 3, 4, 5, 6];
const ACADEMIC_SCHEDULE_ALLOWED_DURATIONS = Array.from({ length: 12 }, (_, index) => (index + 1) * 15);

function createDefaultAcademicScheduleDayBlocks() {
  return Array.from({ length: 8 }, (_, index) => ({
    block: index + 1,
    durationMinutes: 60,
    order: (index + 1) * 10,
  }));
}

function createDefaultAcademicScheduleGroupSettings(index = 0, { weekdays = ACADEMIC_SCHEDULE_WEEKDAYS, gradeKeys = [] } = {}) {
  return {
    key: `schedule_group_${index + 1}`,
    name: '',
    weekdays: weekdays.map((weekday) => Number(weekday)).filter((weekday) => ACADEMIC_SCHEDULE_WEEKDAYS.includes(weekday)),
    gradeKeys: uniqueNormalizedValues(gradeKeys).map((gradeKey) => normalizeAcademicStructureGradeKey(gradeKey)).filter(Boolean),
    dayStartTime: '07:00',
    blocks: createDefaultAcademicScheduleDayBlocks(),
    order: (index + 1) * 10,
  };
}

const DEFAULT_ACADEMIC_SCHEDULE_GROUP_NAME_PATTERN = /^Jornada\s+\d+$/i;

const ACADEMIC_SCHEDULE_DEFAULT_SETTINGS = {
  groups: [],
};

function isImplicitDefaultAcademicScheduleGroup(group, totalGroups = 0) {
  const normalizedName = String(group?.name || '').trim();
  const normalizedWeekdays = uniqueNormalizedValues(group?.weekdays)
    .map((weekday) => Number(weekday || 0))
    .filter((weekday) => ACADEMIC_SCHEDULE_WEEKDAYS.includes(weekday))
    .sort((left, right) => left - right);
  const normalizedGradeKeys = uniqueNormalizedValues(group?.gradeKeys)
    .map((gradeKey) => normalizeAcademicStructureGradeKey(gradeKey))
    .filter(Boolean);
  const normalizedBlocks = Array.isArray(group?.blocks) ? group.blocks : [];
  const expectedWeekdays = [...ACADEMIC_SCHEDULE_WEEKDAYS].sort((left, right) => left - right);
  const hasDefaultBlocks = normalizedBlocks.length === 8
    && normalizedBlocks.every((block, index) => Number(block?.durationMinutes || 0) === 60 && Number(block?.order || 0) === (index + 1) * 10);

  return totalGroups === 1
    && normalizedGradeKeys.length === 0
    && normalizeAcademicScheduleTime(group?.dayStartTime) === '07:00'
    && hasDefaultBlocks
    && normalizedWeekdays.length === expectedWeekdays.length
    && normalizedWeekdays.every((weekday, index) => weekday === expectedWeekdays[index])
    && (!normalizedName || normalizedName === 'Jornada general' || DEFAULT_ACADEMIC_SCHEDULE_GROUP_NAME_PATTERN.test(normalizedName));
}

function sanitizeAcademicScheduleGroups(groups = []) {
  const normalizedGroups = Array.isArray(groups) ? groups : [];
  if (normalizedGroups.length !== 1) {
    return normalizedGroups;
  }

  return isImplicitDefaultAcademicScheduleGroup(normalizedGroups[0], normalizedGroups.length) ? [] : normalizedGroups;
}

function buildAcademicScheduleSlotKey(weekday, block) {
  return `d${Number(weekday)}_b${Number(block)}`;
}

function normalizeAcademicScheduleTime(value) {
  const normalized = normalizeText(value);
  if (!/^\d{2}:\d{2}$/.test(normalized)) {
    return '';
  }

  const [hours, minutes] = normalized.split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return '';
  }

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return '';
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function academicScheduleTimeToMinutes(value) {
  const normalized = normalizeAcademicScheduleTime(value);
  if (!normalized) {
    return null;
  }

  const [hours, minutes] = normalized.split(':').map(Number);
  return (hours * 60) + minutes;
}

function academicScheduleMinutesToTime(totalMinutes) {
  const safeMinutes = Number(totalMinutes || 0);
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function buildAcademicScheduleBlocksFromGroup(group) {
  let runningMinutes = academicScheduleTimeToMinutes(group?.dayStartTime);
  if (runningMinutes === null) {
    runningMinutes = academicScheduleTimeToMinutes('07:00');
  }

  const slots = [];
  (Array.isArray(group?.blocks) ? group.blocks : createDefaultAcademicScheduleDayBlocks()).forEach((item) => {
    const durationMinutes = Number(item?.durationMinutes || 60);
    const parts = Math.max(1, Math.ceil(durationMinutes / 15));
    for (let index = 0; index < parts; index += 1) {
      const startMinutes = runningMinutes;
      const endMinutes = Math.min(runningMinutes + 15, startMinutes + durationMinutes - (index * 15));
      runningMinutes = endMinutes;
      const block = slots.length + 1;
      slots.push({
        block,
        durationMinutes: Math.max(15, endMinutes - startMinutes),
        startTime: academicScheduleMinutesToTime(startMinutes),
        endTime: academicScheduleMinutesToTime(endMinutes),
        label: `${academicScheduleMinutesToTime(startMinutes)} - ${academicScheduleMinutesToTime(endMinutes)}`,
        order: block * 10,
      });
    }
  });

  return slots;
}

function resolveAcademicScheduleGroup(groups, weekday, gradeKey) {
  const normalizedWeekday = Number(weekday || 0);
  const normalizedGradeKey = normalizeAcademicStructureGradeKey(gradeKey);
  const candidates = (Array.isArray(groups) ? groups : []).filter((group) => Array.isArray(group?.weekdays) && group.weekdays.includes(normalizedWeekday));

  const specificMatch = normalizedGradeKey
    ? candidates.find((group) => Array.isArray(group?.gradeKeys) && group.gradeKeys.includes(normalizedGradeKey))
    : null;
  if (specificMatch) {
    return specificMatch;
  }

  const universalMatch = candidates.find((group) => !Array.isArray(group?.gradeKeys) || group.gradeKeys.length === 0);
  if (universalMatch) {
    return universalMatch;
  }

  return createDefaultAcademicScheduleGroupSettings(0, {
    weekdays: [normalizedWeekday],
    gradeKeys: normalizedGradeKey ? [normalizedGradeKey] : [],
  });
}

function normalizeAcademicScheduleSettings(settings, { allowedGradeKeys = new Set() } = {}) {
  const normalizedAllowedGradeKeys = uniqueNormalizedValues(Array.from(allowedGradeKeys || []))
    .map((gradeKey) => normalizeAcademicStructureGradeKey(gradeKey))
    .filter(Boolean);
  const legacyDayStartTime = normalizeAcademicScheduleTime(settings?.dayStartTime);
  const legacyBlocks = Array.isArray(settings?.blocks) && settings.blocks.length > 0 ? settings.blocks : null;
  const legacyDays = Array.isArray(settings?.days) && settings.days.length > 0 ? settings.days : null;
  const incomingGroups = Array.isArray(settings?.groups) && settings.groups.length > 0
    ? settings.groups
    : legacyDays
      ? legacyDays.map((day, index) => ({
        key: normalizeText(day?.key) || `schedule_group_day_${Number(day?.weekday || index + 1)}`,
        name: normalizeText(day?.name),
        weekdays: [Number(day?.weekday || 0)],
        gradeKeys: normalizedAllowedGradeKeys,
        dayStartTime: day?.dayStartTime,
        blocks: day?.blocks,
        order: Number(day?.order || (index + 1) * 10),
      }))
      : legacyBlocks || legacyDayStartTime
        ? [{
          key: 'schedule_group_legacy',
          name: 'Jornada general',
          weekdays: [...ACADEMIC_SCHEDULE_WEEKDAYS],
          gradeKeys: normalizedAllowedGradeKeys,
          dayStartTime: legacyDayStartTime,
          blocks: legacyBlocks,
          order: 10,
        }]
        : [];

  const groupsSource = incomingGroups && incomingGroups.length > 0
    ? incomingGroups
    : [];

  const normalizedGroups = groupsSource.map((group, groupIndex) => {
    const weekdays = uniqueNormalizedValues(group?.weekdays)
      .map((weekday) => Number(weekday || 0))
      .filter((weekday) => ACADEMIC_SCHEDULE_WEEKDAYS.includes(weekday));
    const gradeKeys = uniqueNormalizedValues(group?.gradeKeys)
      .map((gradeKey) => normalizeAcademicStructureGradeKey(gradeKey))
      .filter((gradeKey) => !allowedGradeKeys.size || normalizedAllowedGradeKeys.includes(gradeKey));
    const incomingBlocks = Array.isArray(group?.blocks) && group.blocks.length > 0
      ? group.blocks
      : createDefaultAcademicScheduleDayBlocks();

    const normalizedBlocks = incomingBlocks
      .map((item, index) => {
        const durationMinutes = Number(item?.durationMinutes || 0);
        if (!ACADEMIC_SCHEDULE_ALLOWED_DURATIONS.includes(durationMinutes)) {
          return { invalid: true, message: 'Cada bloque de jornada debe durar entre 15 y 180 minutos, en pasos de 15.' };
        }

        return {
          block: index + 1,
          durationMinutes,
          order: Number(item?.order || (index + 1) * 10),
        };
      })
      .filter(Boolean);

    if (weekdays.length === 0) {
      return { invalid: true, message: 'Cada jornada compartida debe tener al menos un día seleccionado.' };
    }

    if (normalizedBlocks.length === 0) {
      return { invalid: true, message: 'Cada jornada compartida debe tener al menos un bloque configurado.' };
    }

    const invalidBlock = normalizedBlocks.find((item) => item.invalid);
    if (invalidBlock) {
      return invalidBlock;
    }

    return {
      key: normalizeText(group?.key) || `schedule_group_${groupIndex + 1}`,
      name: String(group?.name || '').trim() || `Jornada ${groupIndex + 1}`,
      weekdays,
      gradeKeys,
      dayStartTime: normalizeAcademicScheduleTime(group?.dayStartTime) || legacyDayStartTime || '07:00',
      blocks: normalizedBlocks,
      order: Number(group?.order || (groupIndex + 1) * 10),
    };
  });

  const invalidGroup = normalizedGroups.find((group) => group.invalid);
  if (invalidGroup) {
    return { ok: false, message: invalidGroup.message };
  }

  if (normalizedAllowedGradeKeys.length > 0) {
    const assignmentSet = new Set();
    for (const group of normalizedGroups) {
      const effectiveGradeKeys = group.gradeKeys.length > 0 ? group.gradeKeys : normalizedAllowedGradeKeys;
      for (const weekday of group.weekdays) {
        for (const gradeKey of effectiveGradeKeys) {
          const slotKey = `${gradeKey}::${weekday}`;
          if (assignmentSet.has(slotKey)) {
            return { ok: false, message: 'No puedes asignar dos jornadas distintas al mismo grado en el mismo día.' };
          }
          assignmentSet.add(slotKey);
        }
      }
    }
  }

  return {
    ok: true,
    scheduleSettings: {
      groups: sanitizeAcademicScheduleGroups(normalizedGroups.sort((left, right) => Number(left.order || 0) - Number(right.order || 0))),
    },
  };
}

function buildAcademicScheduleBlocksByWeekday(scheduleSettings, { gradeKey = '', allowedGradeKeys = new Set() } = {}) {
  const normalizedSettings = normalizeAcademicScheduleSettings(scheduleSettings, { allowedGradeKeys });
  const effectiveSettings = normalizedSettings.ok ? normalizedSettings.scheduleSettings : ACADEMIC_SCHEDULE_DEFAULT_SETTINGS;

  return ACADEMIC_SCHEDULE_WEEKDAYS.reduce((accumulator, weekday) => {
    const matchedGroup = resolveAcademicScheduleGroup(effectiveSettings.groups, weekday, gradeKey);
    accumulator[weekday] = buildAcademicScheduleBlocksFromGroup(matchedGroup).map((slot) => ({ ...slot, weekday }));
    return accumulator;
  }, {});
}

function buildAcademicScheduleBlocks(scheduleSettings, { gradeKey = '', weekday = null, allowedGradeKeys = new Set() } = {}) {
  const blocksByWeekday = buildAcademicScheduleBlocksByWeekday(scheduleSettings, { gradeKey, allowedGradeKeys });
  if (weekday !== null) {
    return Array.isArray(blocksByWeekday[weekday]) ? blocksByWeekday[weekday] : [];
  }

  return ACADEMIC_SCHEDULE_WEEKDAYS.flatMap((currentWeekday) => blocksByWeekday[currentWeekday] || []);
}

function createDefaultAcademicScheduleTemplate(scheduleSettings = ACADEMIC_SCHEDULE_DEFAULT_SETTINGS, { gradeKey = '', allowedGradeKeys = new Set() } = {}) {
  const blocksByWeekday = buildAcademicScheduleBlocksByWeekday(scheduleSettings, { gradeKey, allowedGradeKeys });
  return ACADEMIC_SCHEDULE_WEEKDAYS.flatMap((weekday) => (
    (blocksByWeekday[weekday] || []).map((slot) => ({
      key: buildAcademicScheduleSlotKey(weekday, slot.block),
      weekday,
      block: slot.block,
      startTime: slot.startTime,
      endTime: slot.endTime,
      entryType: 'class',
      subjectKey: '',
      breakKey: '',
      breakLabel: '',
      teacherUserId: null,
    }))
  ));
}

function shuffleArray(values = []) {
  const next = [...values];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[randomIndex]] = [next[randomIndex], next[index]];
  }
  return next;
}

function buildAcademicScheduleConflictMessage({ teacherName, subjectLabel, slot, conflictingGradeLabel }) {
  const weekdayLabel = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][Number(slot?.weekday || 1) - 1] || `Día ${slot?.weekday}`;
  return `${teacherName || 'El docente seleccionado'} ya tiene ${subjectLabel || 'una clase'} asignada en ${conflictingGradeLabel || 'otro grado'} el ${weekdayLabel} en el bloque ${slot?.block} (${slot?.startTime || '--:--'} - ${slot?.endTime || '--:--'}).`;
}

function buildTeacherConflictIndex(gradeSchedules, { skipGradeKey = '' } = {}) {
  const conflicts = new Map();

  (Array.isArray(gradeSchedules) ? gradeSchedules : []).forEach((gradeSchedule) => {
    const currentGradeKey = normalizeAcademicStructureGradeKey(gradeSchedule?.gradeKey);
    const currentCourseKey = normalizeText(gradeSchedule?.courseKey);
    const currentScheduleKey = `${currentGradeKey}::${currentCourseKey}`;
    if (!currentGradeKey || currentGradeKey === skipGradeKey || currentScheduleKey === skipGradeKey) {
      return;
    }

    (Array.isArray(gradeSchedule?.weeklySchedule) ? gradeSchedule.weeklySchedule : []).forEach((entry) => {
      if (normalizeText(entry?.entryType || 'class') === 'break') {
        return;
      }

      const teacherUserId = String(entry?.teacherUserId || '').trim();
      const subjectKey = slugifyAcademicStructureKey(entry?.subjectKey);
      const weekday = Number(entry?.weekday || 0);
      const block = Number(entry?.block || 0);
      if (!teacherUserId || !subjectKey || !weekday || !block) {
        return;
      }

      const slotKey = buildAcademicScheduleSlotKey(weekday, block);
      conflicts.set(`${teacherUserId}::${slotKey}`, {
        gradeKey: currentGradeKey,
        courseKey: currentCourseKey,
        subjectKey,
        weekday,
        block,
        startTime: normalizeAcademicScheduleTime(entry?.startTime),
        endTime: normalizeAcademicScheduleTime(entry?.endTime),
      });
    });
  });

  return conflicts;
}

function isAcademicTimeRangeWithinSlot({ startTime, endTime, slot }) {
  const rangeStartMinutes = academicScheduleTimeToMinutes(startTime);
  const rangeEndMinutes = academicScheduleTimeToMinutes(endTime);
  const slotStartMinutes = academicScheduleTimeToMinutes(slot?.startTime);
  const slotEndMinutes = academicScheduleTimeToMinutes(slot?.endTime);

  return rangeStartMinutes !== null
    && rangeEndMinutes !== null
    && slotStartMinutes !== null
    && slotEndMinutes !== null
    && rangeStartMinutes >= slotStartMinutes
    && rangeEndMinutes <= slotEndMinutes;
}

function findAcademicScheduleSlotForRange(scheduleSettings, { gradeKey = '', weekday = 0, startTime = '', endTime = '', allowedGradeKeys = new Set() } = {}) {
  return buildAcademicScheduleBlocks(scheduleSettings, { gradeKey, weekday, allowedGradeKeys }).find((slot) => (
    isAcademicTimeRangeWithinSlot({ startTime, endTime, slot })
  )) || null;
}

function normalizeAcademicScheduleBreaks(breaks, { allowedGradeKeys = new Set(), scheduleSettings = ACADEMIC_SCHEDULE_DEFAULT_SETTINGS } = {}) {
  const normalizedBreaks = (Array.isArray(breaks) ? breaks : [])
    .map((item, index) => {
      const weekday = Number(item?.weekday || 0);
      const label = normalizeText(item?.label) || `Break ${index + 1}`;
      const gradeKeys = uniqueNormalizedValues(item?.gradeKeys).map((gradeKey) => normalizeAcademicStructureGradeKey(gradeKey)).filter(Boolean);
      const startTime = normalizeAcademicScheduleTime(item?.startTime);
      const endTime = normalizeAcademicScheduleTime(item?.endTime);

      if (!ACADEMIC_SCHEDULE_WEEKDAYS.includes(weekday)) {
        return { invalid: true, message: 'Cada break debe estar asignado a un día válido de lunes a sábado.' };
      }

      if (!startTime || !endTime) {
        return { invalid: true, message: 'Cada break debe tener una hora válida de inicio y fin.' };
      }

      const breakStartMinutes = academicScheduleTimeToMinutes(startTime);
      const breakEndMinutes = academicScheduleTimeToMinutes(endTime);
      if (breakStartMinutes === null || breakEndMinutes === null || breakEndMinutes <= breakStartMinutes) {
        return { invalid: true, message: 'La hora de fin del break debe ser posterior a la hora de inicio.' };
      }

      if (gradeKeys.length === 0) {
        return { invalid: true, message: 'Cada break debe tener al menos un grado asociado.' };
      }

      if (allowedGradeKeys.size > 0 && gradeKeys.some((gradeKey) => !allowedGradeKeys.has(gradeKey))) {
        return { invalid: true, message: 'Uno de los grados asociados al break ya no existe en la estructura académica.' };
      }

      const slotAssignments = gradeKeys.map((gradeKey) => {
        const matchedSlot = findAcademicScheduleSlotForRange(scheduleSettings, { gradeKey, weekday, startTime, endTime, allowedGradeKeys });
        return matchedSlot
          ? {
            gradeKey,
            weekday,
            slotKey: buildAcademicScheduleSlotKey(weekday, matchedSlot.block),
            slotStartTime: matchedSlot.startTime,
            slotEndTime: matchedSlot.endTime,
          }
          : null;
      });

      if (slotAssignments.some((assignment) => !assignment)) {
        return { invalid: true, message: 'Cada break debe quedar dentro de una franja válida de la jornada configurada para todos los grados seleccionados.' };
      }

      return {
        key: normalizeText(item?.key) || `break_${weekday}_${startTime.replace(':', '')}_${endTime.replace(':', '')}_${index + 1}`,
        label,
        weekday,
        startTime,
        endTime,
        gradeKeys,
        order: Number(item?.order || (index + 1) * 10),
        slotAssignments,
      };
    })
    .filter(Boolean);

  const invalidBreak = normalizedBreaks.find((item) => item.invalid);
  if (invalidBreak) {
    return { ok: false, message: invalidBreak.message };
  }

  const duplicateSlotAssignments = new Set();
  const seenSlots = new Set();
  normalizedBreaks.forEach((item) => {
    item.slotAssignments.forEach((assignment) => {
      const slotKey = `${assignment.gradeKey}::${assignment.weekday}::${assignment.slotStartTime}::${assignment.slotEndTime}`;
      if (seenSlots.has(slotKey)) {
        duplicateSlotAssignments.add(slotKey);
      }
      seenSlots.add(slotKey);
    });
  });

  if (duplicateSlotAssignments.size > 0) {
    return { ok: false, message: 'No puedes registrar dos breaks que caigan sobre la misma franja de jornada para un grado.' };
  }

  return {
    ok: true,
    breaks: normalizedBreaks
      .map(({ slotAssignments, ...item }) => item)
      .sort((left, right) => Number(left.weekday || 0) - Number(right.weekday || 0) || String(left.startTime || '').localeCompare(String(right.startTime || '')) || String(left.endTime || '').localeCompare(String(right.endTime || '')) || Number(left.order || 0) - Number(right.order || 0)),
  };
}

function buildAcademicBreakSlotIndex(scheduleBreaks, gradeKey, { scheduleSettings = ACADEMIC_SCHEDULE_DEFAULT_SETTINGS, allowedGradeKeys = new Set() } = {}) {
  const normalizedGradeKey = normalizeAcademicStructureGradeKey(gradeKey);
  const breakMap = new Map();

  buildAcademicScheduleBlocks(scheduleSettings, { gradeKey: normalizedGradeKey, allowedGradeKeys }).forEach((slot) => {
    const match = (Array.isArray(scheduleBreaks) ? scheduleBreaks : []).find((item) => {
      const gradeKeys = Array.isArray(item?.gradeKeys) ? item.gradeKeys.map((gradeItem) => normalizeAcademicStructureGradeKey(gradeItem)).filter(Boolean) : [];
      return gradeKeys.includes(normalizedGradeKey)
        && Number(item?.weekday || 0) === Number(slot.weekday || 0)
        && isAcademicTimeRangeWithinSlot({
          startTime: normalizeAcademicScheduleTime(item?.startTime),
          endTime: normalizeAcademicScheduleTime(item?.endTime),
          slot,
        });
    });

    if (!match) {
      return;
    }

    breakMap.set(buildAcademicScheduleSlotKey(slot.weekday, slot.block), {
      key: normalizeText(match?.key),
      label: normalizeText(match?.label) || 'Break',
      weekday: Number(match?.weekday || 0),
      startTime: normalizeAcademicScheduleTime(match?.startTime),
      endTime: normalizeAcademicScheduleTime(match?.endTime),
    });
  });

  return breakMap;
}

function applyAcademicScheduleBreaksToConfiguration(configuration) {
  const allowedGradeKeys = new Set((Array.isArray(configuration?.grades) ? configuration.grades : []).map((grade) => normalizeAcademicStructureGradeKey(grade?.key || grade?.label)).filter(Boolean));
  const normalizedSettings = normalizeAcademicScheduleSettings(configuration?.scheduleSettings, { allowedGradeKeys });
  const scheduleSettings = normalizedSettings.ok ? normalizedSettings.scheduleSettings : ACADEMIC_SCHEDULE_DEFAULT_SETTINGS;
  const serializedBreaks = normalizeAcademicScheduleBreaks(configuration?.scheduleBreaks, { allowedGradeKeys, scheduleSettings });
  const normalizedBreaks = serializedBreaks.ok ? serializedBreaks.breaks : [];
  configuration.scheduleBreaks = normalizedBreaks;

  const affectedGradeKeys = new Set(normalizedBreaks.flatMap((item) => item.gradeKeys));
  affectedGradeKeys.forEach((gradeKey) => {
    ensureAcademicGradeSchedule(configuration, gradeKey);
  });

  (Array.isArray(configuration.gradeSchedules) ? configuration.gradeSchedules : []).forEach((gradeSchedule) => {
    const gradeKey = normalizeAcademicStructureGradeKey(gradeSchedule?.gradeKey);
    const breakMap = buildAcademicBreakSlotIndex(normalizedBreaks, gradeKey, { scheduleSettings, allowedGradeKeys });
    const baseEntries = Array.isArray(gradeSchedule?.weeklySchedule) ? gradeSchedule.weeklySchedule : [];
    const nextEntryMap = new Map();

    baseEntries.forEach((entry) => {
      const weekday = Number(entry?.weekday || 0);
      const block = Number(entry?.block || 0);
      const slotKey = buildAcademicScheduleSlotKey(weekday, block);
      const breakEntry = breakMap.get(slotKey);
      const entryType = normalizeText(entry?.entryType || 'class') === 'break' ? 'break' : 'class';

      if (!weekday || !block || (!breakEntry && entryType !== 'break' && !slugifyAcademicStructureKey(entry?.subjectKey))) {
        return;
      }

      if (breakEntry) {
        nextEntryMap.set(slotKey, {
          key: normalizeText(entry?.key) || slotKey,
          weekday,
          block,
          startTime: breakEntry.startTime || normalizeAcademicScheduleTime(entry?.startTime),
          endTime: breakEntry.endTime || normalizeAcademicScheduleTime(entry?.endTime),
          entryType: 'break',
          subjectKey: '',
          breakKey: breakEntry.key,
          breakLabel: breakEntry.label,
          teacherUserId: null,
        });
        return;
      }

      nextEntryMap.set(slotKey, {
        key: normalizeText(entry?.key) || slotKey,
        weekday,
        block,
        startTime: normalizeAcademicScheduleTime(entry?.startTime),
        endTime: normalizeAcademicScheduleTime(entry?.endTime),
        entryType,
        subjectKey: entryType === 'break' ? '' : slugifyAcademicStructureKey(entry?.subjectKey),
        breakKey: entryType === 'break' ? normalizeText(entry?.breakKey) : '',
        breakLabel: entryType === 'break' ? normalizeText(entry?.breakLabel) || 'Break' : '',
        teacherUserId: entryType === 'break' ? null : (entry?.teacherUserId || null),
      });
    });

    breakMap.forEach((breakEntry, slotKey) => {
      const [, weekdayPart, blockPart] = String(slotKey).match(/^d(\d+)_b(\d+)$/) || [];
      nextEntryMap.set(slotKey, {
        key: slotKey,
        weekday: Number(weekdayPart || 0),
        block: Number(blockPart || 0),
        startTime: breakEntry.startTime,
        endTime: breakEntry.endTime,
        entryType: 'break',
        subjectKey: '',
        breakKey: breakEntry.key,
        breakLabel: breakEntry.label,
        teacherUserId: null,
      });
    });

    gradeSchedule.weeklySchedule = Array.from(nextEntryMap.values())
      .filter((entry) => ACADEMIC_SCHEDULE_WEEKDAYS.includes(Number(entry.weekday || 0)) && Number(entry.block || 0) > 0 && entry.startTime && entry.endTime)
      .sort((left, right) => Number(left.weekday || 0) - Number(right.weekday || 0) || Number(left.block || 0) - Number(right.block || 0));
  });
}

function academicGradeScheduleHasEntries(schedule) {
  return Array.isArray(schedule?.weeklySchedule)
    && schedule.weeklySchedule.some((entry) => (
      Number(entry?.weekday || 0) >= 1
      && normalizeText(entry?.startTime)
      && normalizeText(entry?.endTime)
    ));
}

function pruneEmptyDuplicateGradeSchedules(configuration) {
  if (!Array.isArray(configuration?.gradeSchedules)) {
    return;
  }

  const populatedGrades = new Set(
    configuration.gradeSchedules
      .filter((schedule) => academicGradeScheduleHasEntries(schedule))
      .map((schedule) => normalizeAcademicStructureGradeKey(schedule?.gradeKey))
      .filter(Boolean)
  );

  configuration.gradeSchedules = configuration.gradeSchedules.filter((schedule) => {
    const gradeKey = normalizeAcademicStructureGradeKey(schedule?.gradeKey);
    if (!gradeKey || !populatedGrades.has(gradeKey)) {
      return true;
    }

    return academicGradeScheduleHasEntries(schedule);
  });
}

function ensureAcademicGradeSchedule(configuration, gradeKey, { courseKey = '' } = {}) {
  const normalizedGradeKey = normalizeAcademicStructureGradeKey(gradeKey);
  const normalizedCourseKey = normalizeText(courseKey);
  if (!normalizedGradeKey) {
    return null;
  }

  if (!Array.isArray(configuration.gradeSchedules)) {
    configuration.gradeSchedules = [];
  }

  let schedule = configuration.gradeSchedules.find((item) => (
    normalizeAcademicStructureGradeKey(item?.gradeKey) === normalizedGradeKey
    && normalizeText(item?.courseKey) === normalizedCourseKey
  ));
  if (!schedule) {
    const allowedGradeKeys = new Set((Array.isArray(configuration?.grades) ? configuration.grades : []).map((grade) => normalizeAcademicStructureGradeKey(grade?.key || grade?.label)).filter(Boolean));
    schedule = {
      gradeKey: normalizedGradeKey,
      courseKey: normalizedCourseKey,
      subjectLoads: [],
      weeklySchedule: createDefaultAcademicScheduleTemplate(configuration?.scheduleSettings, { gradeKey: normalizedGradeKey, allowedGradeKeys }),
      updatedAt: null,
    };
    configuration.gradeSchedules.push(schedule);
  }

  return schedule;
}

function normalizeAcademicScheduleSubjectLoads(subjectLoads, { allowedSubjectKeys = new Set(), teacherIds = new Set() } = {}) {
  const normalizedLoads = (Array.isArray(subjectLoads) ? subjectLoads : [])
    .map((item, index) => {
      const subjectKey = slugifyAcademicStructureKey(item?.subjectKey);
      const weeklyHours = Math.max(0, Math.min(40, Number(item?.weeklyHours || 0)));
      const teacherUserId = String(item?.teacherUserId || '').trim();

      if (!subjectKey) {
        return null;
      }

      if (allowedSubjectKeys.size > 0 && !allowedSubjectKeys.has(subjectKey)) {
        return { invalid: true, message: 'Solo puedes configurar asignaturas enlazadas al grado seleccionado.' };
      }

      if (!Number.isFinite(weeklyHours) || weeklyHours < 0) {
        return { invalid: true, message: 'Las horas semanales deben ser un número válido.' };
      }

      if (teacherUserId && teacherIds.size > 0 && !teacherIds.has(teacherUserId)) {
        return { invalid: true, message: 'Uno de los docentes seleccionados no existe o no está activo.' };
      }

      return {
        subjectKey,
        weeklyHours: Math.round(weeklyHours),
        teacherUserId: teacherUserId || null,
        order: Number(item?.order || (index + 1) * 10),
      };
    })
    .filter(Boolean);

  const invalidLoad = normalizedLoads.find((item) => item.invalid);
  if (invalidLoad) {
    return { ok: false, message: invalidLoad.message };
  }

  const dedupedLoads = Array.from(new Map(
    normalizedLoads.map((item) => [item.subjectKey, item])
  ).values()).sort((left, right) => Number(left.order || 0) - Number(right.order || 0));

  return { ok: true, subjectLoads: dedupedLoads };
}

function normalizeAcademicSubjectLoadTemplates(subjectLoadTemplates, { allowedSubjectKeys = new Set(), teacherIds = new Set(), allowedGradeKeys = new Set(), subjectGradeMap = new Map() } = {}) {
  const normalizedTemplates = (Array.isArray(subjectLoadTemplates) ? subjectLoadTemplates : [])
    .map((item, index) => {
      const subjectKey = slugifyAcademicStructureKey(item?.subjectKey);
      const teacherUserId = String(item?.teacherUserId || '').trim();
      const weeklyHours = Math.max(0, Math.min(40, Number(item?.weeklyHours || 0)));
      const gradeKeys = uniqueNormalizedValues(item?.gradeKeys)
        .map((gradeKey) => normalizeAcademicStructureGradeKey(gradeKey))
        .filter(Boolean);

      if (!subjectKey) {
        return null;
      }

      if (allowedSubjectKeys.size > 0 && !allowedSubjectKeys.has(subjectKey)) {
        return { invalid: true, message: 'La carga compartida solo puede usar asignaturas activas.' };
      }

      if (teacherUserId && teacherIds.size > 0 && !teacherIds.has(teacherUserId)) {
        return { invalid: true, message: 'Uno de los docentes seleccionados para la carga compartida no existe o no está activo.' };
      }

      if (gradeKeys.length === 0) {
        return { invalid: true, message: 'Cada carga académica compartida debe aplicarse al menos a un grado.' };
      }

      if (allowedGradeKeys.size > 0 && gradeKeys.some((gradeKey) => !allowedGradeKeys.has(gradeKey))) {
        return { invalid: true, message: 'Uno de los grados configurados en la carga académica ya no existe.' };
      }

      const linkedGradeKeys = subjectGradeMap.get(subjectKey) || new Set();
      if (linkedGradeKeys.size > 0 && gradeKeys.some((gradeKey) => !linkedGradeKeys.has(gradeKey))) {
        return { invalid: true, message: 'La carga compartida solo puede asignarse a grados donde la asignatura ya está enlazada.' };
      }

      return {
        key: normalizeText(item?.key) || `subject_load_template_${index + 1}`,
        subjectKey,
        teacherUserId: teacherUserId || null,
        weeklyHours: Math.round(weeklyHours),
        gradeKeys,
        order: Number(item?.order || (index + 1) * 10),
      };
    })
    .filter(Boolean);

  const invalidTemplate = normalizedTemplates.find((item) => item.invalid);
  if (invalidTemplate) {
    return { ok: false, message: invalidTemplate.message };
  }

  const assignmentIndex = new Set();
  for (const template of normalizedTemplates) {
    for (const gradeKey of template.gradeKeys) {
      const assignmentKey = `${template.subjectKey}::${gradeKey}`;
      if (assignmentIndex.has(assignmentKey)) {
        return { ok: false, message: 'No puedes registrar dos cargas compartidas para la misma asignatura en el mismo grado.' };
      }
      assignmentIndex.add(assignmentKey);
    }
  }

  return {
    ok: true,
    subjectLoadTemplates: normalizedTemplates.sort((left, right) => Number(left.order || 0) - Number(right.order || 0)),
  };
}

function normalizeAcademicTeachingAvailability(teachingAvailability, { allowedSubjectKeys = new Set(), teacherIds = new Set(), allowedGradeKeys = new Set(), subjectGradeMap = new Map() } = {}) {
  const normalizedRules = (Array.isArray(teachingAvailability) ? teachingAvailability : [])
    .map((item, index) => {
      const subjectKey = slugifyAcademicStructureKey(item?.subjectKey);
      const teacherUserId = String(item?.teacherUserId || '').trim();
      const gradeKeys = uniqueNormalizedValues(item?.gradeKeys)
        .map((gradeKey) => normalizeAcademicStructureGradeKey(gradeKey))
        .filter(Boolean);
      const windows = (Array.isArray(item?.windows) ? item.windows : [])
        .map((windowItem) => ({
          weekday: Number(windowItem?.weekday || 0),
          startTime: normalizeAcademicScheduleTime(windowItem?.startTime),
          endTime: normalizeAcademicScheduleTime(windowItem?.endTime),
        }))
        .filter((windowItem) => windowItem.weekday && windowItem.startTime && windowItem.endTime);

      if (!subjectKey) {
        return null;
      }

      if (!teacherUserId) {
        return { invalid: true, message: 'Cada regla de disponibilidad docente debe seleccionar un docente.' };
      }

      if (allowedSubjectKeys.size > 0 && !allowedSubjectKeys.has(subjectKey)) {
        return { invalid: true, message: 'La disponibilidad docente solo puede usar asignaturas activas.' };
      }

      if (teacherIds.size > 0 && !teacherIds.has(teacherUserId)) {
        return { invalid: true, message: 'Uno de los docentes configurados en disponibilidad no existe o no está activo.' };
      }

      if (gradeKeys.length === 0) {
        return { invalid: true, message: 'Cada regla de disponibilidad debe aplicarse al menos a un grado.' };
      }

      if (allowedGradeKeys.size > 0 && gradeKeys.some((gradeKey) => !allowedGradeKeys.has(gradeKey))) {
        return { invalid: true, message: 'Uno de los grados configurados en disponibilidad ya no existe.' };
      }

      const linkedGradeKeys = subjectGradeMap.get(subjectKey) || new Set();
      if (linkedGradeKeys.size > 0 && gradeKeys.some((gradeKey) => !linkedGradeKeys.has(gradeKey))) {
        return { invalid: true, message: 'La disponibilidad docente solo puede aplicarse a grados donde la asignatura ya está enlazada.' };
      }

      if (windows.length === 0) {
        return { invalid: true, message: 'Cada regla de disponibilidad debe tener al menos un día y un rango horario.' };
      }

      for (const windowItem of windows) {
        if (!ACADEMIC_SCHEDULE_WEEKDAYS.includes(windowItem.weekday)) {
          return { invalid: true, message: 'La disponibilidad docente solo puede usar días de lunes a sábado.' };
        }

        const startMinutes = academicScheduleTimeToMinutes(windowItem.startTime);
        const endMinutes = academicScheduleTimeToMinutes(windowItem.endTime);
        if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
          return { invalid: true, message: 'Cada rango de disponibilidad debe tener hora de inicio y fin válidas.' };
        }
      }

      return {
        key: normalizeText(item?.key) || `teaching_availability_${index + 1}`,
        subjectKey,
        teacherUserId,
        gradeKeys,
        windows: windows.sort((left, right) => Number(left.weekday || 0) - Number(right.weekday || 0) || compareAcademicLabels(left.startTime, right.startTime)),
        order: Number(item?.order || (index + 1) * 10),
      };
    })
    .filter(Boolean);

  const invalidRule = normalizedRules.find((item) => item.invalid);
  if (invalidRule) {
    return { ok: false, message: invalidRule.message };
  }

  return {
    ok: true,
    teachingAvailability: normalizedRules.sort((left, right) => Number(left.order || 0) - Number(right.order || 0)),
  };
}

function buildAcademicSubjectLoadsFromTemplates(subjectLoadTemplates, gradeKey) {
  const normalizedGradeKey = normalizeAcademicStructureGradeKey(gradeKey);
  return (Array.isArray(subjectLoadTemplates) ? subjectLoadTemplates : [])
    .filter((item) => Array.isArray(item?.gradeKeys) && item.gradeKeys.includes(normalizedGradeKey))
    .map((item, index) => ({
      subjectKey: slugifyAcademicStructureKey(item?.subjectKey),
      weeklyHours: Math.max(0, Math.min(40, Number(item?.weeklyHours || 0))),
      teacherUserId: item?.teacherUserId ? String(item.teacherUserId) : null,
      order: Number(item?.order || (index + 1) * 10),
    }))
    .filter((item) => item.subjectKey)
    .sort((left, right) => Number(left.order || 0) - Number(right.order || 0));
}

function syncAcademicGradeSchedulesFromTemplates(configuration, { gradeKeys = [] } = {}) {
  const allowedGradeKeys = new Set((Array.isArray(configuration?.grades) ? configuration.grades : []).map((grade) => normalizeAcademicStructureGradeKey(grade?.key || grade?.label)).filter(Boolean));
  const targetGradeKeys = gradeKeys.length > 0
    ? uniqueNormalizedValues(gradeKeys).map((gradeKey) => normalizeAcademicStructureGradeKey(gradeKey)).filter((gradeKey) => allowedGradeKeys.has(gradeKey))
    : Array.from(allowedGradeKeys);

  targetGradeKeys.forEach((gradeKey) => {
    const gradeSchedule = ensureAcademicGradeSchedule(configuration, gradeKey);
    const nextSubjectLoads = buildAcademicSubjectLoadsFromTemplates(configuration?.subjectLoadTemplates, gradeKey);
    const loadMap = new Map(nextSubjectLoads.map((load) => [load.subjectKey, load]));
    const allowedSlots = createDefaultAcademicScheduleTemplate(configuration?.scheduleSettings, { gradeKey, allowedGradeKeys });
    const existingEntries = Array.isArray(gradeSchedule?.weeklySchedule) && gradeSchedule.weeklySchedule.length > 0
      ? gradeSchedule.weeklySchedule
      : allowedSlots;

    gradeSchedule.subjectLoads = nextSubjectLoads;
    gradeSchedule.weeklySchedule = existingEntries.map((entry) => {
      if (normalizeText(entry?.entryType || 'class') === 'break') {
        return { ...entry, subjectKey: '', teacherUserId: null };
      }

      const subjectKey = slugifyAcademicStructureKey(entry?.subjectKey);
      if (!subjectKey || !loadMap.has(subjectKey)) {
        return {
          ...entry,
          subjectKey: '',
          teacherUserId: null,
        };
      }

      return {
        ...entry,
        subjectKey,
        teacherUserId: loadMap.get(subjectKey)?.teacherUserId || null,
      };
    });
  });
}

function resolveAcademicTeachingAvailabilityWindows(teachingAvailability, { teacherUserId = '', subjectKey = '', gradeKey = '' } = {}) {
  const normalizedTeacherUserId = String(teacherUserId || '').trim();
  const normalizedSubjectKey = slugifyAcademicStructureKey(subjectKey);
  const normalizedGradeKey = normalizeAcademicStructureGradeKey(gradeKey);
  const matchingRules = (Array.isArray(teachingAvailability) ? teachingAvailability : []).filter((item) => (
    String(item?.teacherUserId || '').trim() === normalizedTeacherUserId
    && slugifyAcademicStructureKey(item?.subjectKey) === normalizedSubjectKey
  ));

  const specificRules = matchingRules.filter((item) => Array.isArray(item?.gradeKeys) && item.gradeKeys.includes(normalizedGradeKey));
  const genericRules = matchingRules.filter((item) => !Array.isArray(item?.gradeKeys) || item.gradeKeys.length === 0);
  const effectiveRules = specificRules.length > 0 ? specificRules : genericRules;

  return effectiveRules.flatMap((item) => Array.isArray(item?.windows) ? item.windows : []);
}

function isAcademicScheduleSlotAllowedByTeachingAvailability({ teachingAvailability = [], teacherUserId = '', subjectKey = '', gradeKey = '', slot = null }) {
  const windows = resolveAcademicTeachingAvailabilityWindows(teachingAvailability, { teacherUserId, subjectKey, gradeKey });
  if (windows.length === 0 || !slot) {
    return true;
  }

  const slotWeekday = Number(slot?.weekday || 0);
  const slotStartMinutes = academicScheduleTimeToMinutes(slot?.startTime);
  const slotEndMinutes = academicScheduleTimeToMinutes(slot?.endTime);
  if (slotStartMinutes === null || slotEndMinutes === null) {
    return false;
  }

  return windows.some((windowItem) => {
    const windowStart = academicScheduleTimeToMinutes(windowItem?.startTime);
    const windowEnd = academicScheduleTimeToMinutes(windowItem?.endTime);
    return Number(windowItem?.weekday || 0) === slotWeekday
      && windowStart !== null
      && windowEnd !== null
      && slotStartMinutes >= windowStart
      && slotEndMinutes <= windowEnd;
  });
}

function normalizeAcademicWeeklyScheduleEntries(entries, { subjectLoadMap = new Map(), breakSlotMap = new Map(), scheduleSettings = ACADEMIC_SCHEDULE_DEFAULT_SETTINGS, gradeKey = '', allowedGradeKeys = new Set(), teachingAvailability = [] } = {}) {
  const scheduleBlockMap = new Map(buildAcademicScheduleBlocks(scheduleSettings, { gradeKey, allowedGradeKeys }).map((slot) => [buildAcademicScheduleSlotKey(slot.weekday, slot.block), slot]));
  const normalizedEntries = (Array.isArray(entries) ? entries : [])
    .map((entry, index) => {
      const weekday = Number(entry?.weekday || 0);
      const block = Number(entry?.block || 0);
      const startTime = normalizeAcademicScheduleTime(entry?.startTime);
      const endTime = normalizeAcademicScheduleTime(entry?.endTime);
      const slotKey = buildAcademicScheduleSlotKey(weekday, block);
      const breakSlot = breakSlotMap.get(slotKey);
      const slotTemplate = scheduleBlockMap.get(slotKey);
      const entryType = breakSlot ? 'break' : (normalizeText(entry?.entryType || 'class') === 'break' ? 'break' : 'class');
      const subjectKey = slugifyAcademicStructureKey(entry?.subjectKey);
      const entryTeacherUserId = String(entry?.teacherUserId || '').trim();
      const configuredLoad = subjectKey ? subjectLoadMap.get(subjectKey) : null;

      if (!ACADEMIC_SCHEDULE_WEEKDAYS.includes(weekday)) {
        return { invalid: true, message: 'Cada bloque del horario debe tener un día de lunes a sábado.' };
      }

      if (!Number.isInteger(block) || !slotTemplate) {
        return { invalid: true, message: 'Cada bloque del horario debe tener un número de bloque válido.' };
      }

      if (!startTime || !endTime) {
        return { invalid: true, message: 'Cada bloque del horario debe tener hora inicial y final válidas.' };
      }

      if (breakSlot && subjectKey) {
        return { invalid: true, message: 'No puedes asignar materias dentro de un bloque definido como break.' };
      }

      if (entryType !== 'break' && subjectKey && !configuredLoad) {
        return { invalid: true, message: 'El horario solo puede usar asignaturas que tengan carga horaria configurada para este grado.' };
      }

      const effectiveTeacherUserId = entryTeacherUserId || configuredLoad?.teacherUserId || null;

      if (entryType !== 'break' && subjectKey && effectiveTeacherUserId && !isAcademicScheduleSlotAllowedByTeachingAvailability({
        teachingAvailability,
        teacherUserId: effectiveTeacherUserId,
        subjectKey,
        gradeKey,
        slot: slotTemplate,
      })) {
        return { invalid: true, message: 'La disponibilidad docente configurada no permite ubicar esa asignatura en ese bloque.' };
      }

      return {
        key: normalizeText(entry?.key) || buildAcademicScheduleSlotKey(weekday, block),
        weekday,
        block,
        startTime: breakSlot?.startTime || startTime || slotTemplate.startTime,
        endTime: breakSlot?.endTime || endTime || slotTemplate.endTime,
        entryType,
        subjectKey: entryType === 'break' ? '' : (subjectKey || ''),
        breakKey: entryType === 'break' ? (breakSlot?.key || normalizeText(entry?.breakKey)) : '',
        breakLabel: entryType === 'break' ? (breakSlot?.label || normalizeText(entry?.breakLabel) || 'Break') : '',
        teacherUserId: entryType === 'break' ? null : (subjectKey ? effectiveTeacherUserId : null),
        order: Number(entry?.order || (index + 1) * 10),
      };
    })
    .filter(Boolean);

  const invalidEntry = normalizedEntries.find((entry) => entry.invalid);
  if (invalidEntry) {
    return { ok: false, message: invalidEntry.message };
  }

  const usedSlotKeys = new Set();
  const subjectCounter = new Map();
  for (const entry of normalizedEntries) {
    const slotIdentity = `${entry.weekday}:${entry.block}`;
    if (usedSlotKeys.has(slotIdentity)) {
      return { ok: false, message: 'No puedes repetir el mismo bloque horario dentro del grado.' };
    }
    usedSlotKeys.add(slotIdentity);

    if (entry.entryType !== 'break' && entry.subjectKey) {
      subjectCounter.set(entry.subjectKey, Number(subjectCounter.get(entry.subjectKey) || 0) + 1);
    }
  }

  for (const [subjectKey, count] of subjectCounter.entries()) {
    const configuredLoad = subjectLoadMap.get(subjectKey);
    if (configuredLoad && Number(configuredLoad.weeklyHours || 0) > 0 && count > Number(configuredLoad.weeklyHours || 0)) {
      return { ok: false, message: 'El horario no puede superar las horas semanales configuradas por asignatura.' };
    }
  }

  return {
    ok: true,
    weeklySchedule: normalizedEntries.sort((left, right) => Number(left.weekday || 0) - Number(right.weekday || 0) || Number(left.block || 0) - Number(right.block || 0)),
  };
}

function generateAcademicWeeklySchedule({ slotTemplates = [], subjectLoads = [], conflictIndex = new Map(), teachingAvailability = [], gradeKey = '' }) {
  const loadOccurrences = [];
  subjectLoads.forEach((load) => {
    for (let index = 0; index < Number(load.weeklyHours || 0); index += 1) {
      loadOccurrences.push({
        subjectKey: load.subjectKey,
        teacherUserId: String(load.teacherUserId || '').trim(),
      });
    }
  });

  if (loadOccurrences.length === 0) {
    return { ok: false, message: 'Primero configura horas semanales para al menos una asignatura.' };
  }

  const classSlots = slotTemplates.filter((slot) => normalizeText(slot?.entryType || 'class') !== 'break');

  if (loadOccurrences.length > classSlots.length) {
    return { ok: false, message: 'La carga semanal configurada supera la cantidad de bloques disponibles en el horario.' };
  }

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const shuffledSlots = shuffleArray(classSlots).map((slot) => ({ ...slot, entryType: 'class', subjectKey: '', breakKey: '', breakLabel: '', teacherUserId: null }));
    const remainingSlots = [...shuffledSlots];
    const nextSchedule = slotTemplates.map((slot) => (normalizeText(slot?.entryType || 'class') === 'break'
      ? { ...slot, entryType: 'break', subjectKey: '', teacherUserId: null }
      : { ...slot, entryType: 'class', subjectKey: '', breakKey: '', breakLabel: '', teacherUserId: null }));
    let failed = false;

    const sortedOccurrences = shuffleArray(loadOccurrences).sort((left, right) => {
      const leftAvailable = remainingSlots.filter((slot) => {
        if (left.teacherUserId && conflictIndex.has(`${left.teacherUserId}::${buildAcademicScheduleSlotKey(slot.weekday, slot.block)}`)) {
          return false;
        }
        return isAcademicScheduleSlotAllowedByTeachingAvailability({ teachingAvailability, teacherUserId: left.teacherUserId, subjectKey: left.subjectKey, gradeKey, slot });
      }).length;
      const rightAvailable = remainingSlots.filter((slot) => {
        if (right.teacherUserId && conflictIndex.has(`${right.teacherUserId}::${buildAcademicScheduleSlotKey(slot.weekday, slot.block)}`)) {
          return false;
        }
        return isAcademicScheduleSlotAllowedByTeachingAvailability({ teachingAvailability, teacherUserId: right.teacherUserId, subjectKey: right.subjectKey, gradeKey, slot });
      }).length;
      return leftAvailable - rightAvailable;
    });

    for (const occurrence of sortedOccurrences) {
      const candidateIndexes = remainingSlots
        .map((slot, index) => ({ slot, index }))
        .filter(({ slot }) => {
          if (!occurrence.teacherUserId) {
            return isAcademicScheduleSlotAllowedByTeachingAvailability({ teachingAvailability, teacherUserId: '', subjectKey: occurrence.subjectKey, gradeKey, slot });
          }
          if (conflictIndex.has(`${occurrence.teacherUserId}::${buildAcademicScheduleSlotKey(slot.weekday, slot.block)}`)) {
            return false;
          }
          return isAcademicScheduleSlotAllowedByTeachingAvailability({ teachingAvailability, teacherUserId: occurrence.teacherUserId, subjectKey: occurrence.subjectKey, gradeKey, slot });
        });

      if (candidateIndexes.length === 0) {
        failed = true;
        break;
      }

      const selectedCandidate = candidateIndexes[Math.floor(Math.random() * candidateIndexes.length)];
      const selectedSlot = remainingSlots.splice(selectedCandidate.index, 1)[0];
      const scheduleEntry = nextSchedule.find((entry) => entry.key === selectedSlot.key && normalizeText(entry?.entryType || 'class') !== 'break');
      if (!scheduleEntry) {
        failed = true;
        break;
      }
      scheduleEntry.subjectKey = occurrence.subjectKey;
      scheduleEntry.teacherUserId = occurrence.teacherUserId || null;
    }

    if (!failed) {
      return {
        ok: true,
        weeklySchedule: nextSchedule.sort((left, right) => Number(left.weekday || 0) - Number(right.weekday || 0) || Number(left.block || 0) - Number(right.block || 0)),
      };
    }
  }

  return { ok: false, message: 'No fue posible generar el horario sin cruces de profesor y respetando la disponibilidad docente. Ajusta la carga o amplía horarios disponibles.' };
}

function normalizeAcademicStructureDate(value) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'invalid' : parsed;
}

function normalizeAcademicPeriodsConfiguration(periods) {
  const normalizedPeriods = (Array.isArray(periods) ? periods : [])
    .map((period, index) => {
      const name = normalizeText(period?.name) || `Periodo ${index + 1}`;
      const weight = Number(period?.weight || 0);
      const startDate = normalizeAcademicStructureDate(period?.startDate);
      const endDate = normalizeAcademicStructureDate(period?.endDate);

      if (!Number.isFinite(weight) || weight <= 0 || weight > 100) {
        return { invalid: true, message: `El peso de ${name} debe ser mayor a 0 y menor o igual a 100.` };
      }

      if (startDate === 'invalid' || endDate === 'invalid') {
        return { invalid: true, message: `Las fechas de ${name} no tienen un formato valido.` };
      }

      if (startDate && endDate && startDate > endDate) {
        return { invalid: true, message: `La fecha final de ${name} debe ser posterior a la fecha inicial.` };
      }

      const providedKey = normalizeText(period?.key);
      return {
        key: providedKey || `period_${index + 1}_${slugifyAcademicStructureKey(name) || index + 1}`,
        name,
        weight: Number(weight.toFixed(2)),
        order: Number(period?.order || (index + 1) * 10),
        startDate,
        endDate,
      };
    });

  const invalidPeriod = normalizedPeriods.find((period) => period.invalid);
  if (invalidPeriod) {
    return { ok: false, message: invalidPeriod.message };
  }

  if (normalizedPeriods.length === 0) {
    return { ok: true, periods: createDefaultAcademicStructurePeriods() };
  }

  const totalWeight = normalizedPeriods.reduce((sum, period) => sum + Number(period.weight || 0), 0);
  if (Math.abs(totalWeight - 100) > 0.01) {
    return { ok: false, message: 'La suma de los periodos académicos debe ser exactamente 100%.' };
  }

  const duplicatedKeys = new Set();
  const seenKeys = new Set();
  normalizedPeriods.forEach((period) => {
    if (seenKeys.has(period.key)) {
      duplicatedKeys.add(period.key);
    }
    seenKeys.add(period.key);
  });

  if (duplicatedKeys.size > 0) {
    return { ok: false, message: 'Cada periodo académico debe tener una llave unica.' };
  }

  return {
    ok: true,
    periods: normalizedPeriods.sort((left, right) => Number(left.order || 0) - Number(right.order || 0)),
  };
}

const DEFAULT_ACADEMIC_PERFORMANCE_LEVELS = [
  { key: 'deficiente', label: 'Deficiente', minScore: 0, maxScore: 59, color: '#ef4444', order: 10 },
  { key: 'insuficiente', label: 'Insuficiente', minScore: 60, maxScore: 69, color: '#f97316', order: 20 },
  { key: 'aceptable', label: 'Aceptable', minScore: 70, maxScore: 79, color: '#eab308', order: 30 },
  { key: 'bueno', label: 'Bueno', minScore: 80, maxScore: 89, color: '#65a30d', order: 40 },
  { key: 'sobresaliente', label: 'Sobresaliente', minScore: 90, maxScore: 95, color: '#15803d', order: 50 },
  { key: 'excelente', label: 'Excelente', minScore: 96, maxScore: 100, color: '#166534', order: 60 },
];

const DEFAULT_ACADEMIC_GRADING_SCALE = {
  minScore: 0,
  maxScore: 100,
  passingScore: 70,
  performanceLevels: DEFAULT_ACADEMIC_PERFORMANCE_LEVELS,
};

function normalizeAcademicGradingScale(rawScale = {}) {
  const hasPerformanceLevels = Array.isArray(rawScale?.performanceLevels) && rawScale.performanceLevels.length > 0;
  const shouldUseDefaultScale = !rawScale || Object.keys(rawScale).length === 0 || (!hasPerformanceLevels && Number(rawScale?.maxScore ?? 100) <= 5 && Number(rawScale?.passingScore ?? 70) <= 3);
  const sourceScale = shouldUseDefaultScale ? DEFAULT_ACADEMIC_GRADING_SCALE : rawScale;
  const minScore = Number(sourceScale?.minScore ?? DEFAULT_ACADEMIC_GRADING_SCALE.minScore);
  const maxScore = Number(sourceScale?.maxScore ?? DEFAULT_ACADEMIC_GRADING_SCALE.maxScore);
  const passingScore = Number(sourceScale?.passingScore ?? DEFAULT_ACADEMIC_GRADING_SCALE.passingScore);

  if (!Number.isFinite(minScore) || !Number.isFinite(maxScore) || !Number.isFinite(passingScore)) {
    return { ok: false, message: 'La escala de calificación debe usar valores numéricos.' };
  }

  if (minScore < 0 || maxScore <= minScore || maxScore > 100) {
    return { ok: false, message: 'La escala de calificación debe tener un mínimo válido y un máximo mayor al mínimo.' };
  }

  if (passingScore < minScore || passingScore > maxScore) {
    return { ok: false, message: 'La calificación aprobatoria debe estar dentro de la escala de calificación.' };
  }

  const performanceLevels = (Array.isArray(sourceScale?.performanceLevels) ? sourceScale.performanceLevels : DEFAULT_ACADEMIC_PERFORMANCE_LEVELS)
    .map((level, index) => {
      const label = normalizeText(level?.label);
      const levelMinScore = Number(level?.minScore);
      const levelMaxScore = Number(level?.maxScore);

      if (!label) {
        return { invalid: true, message: 'Cada rango de desempeño debe tener un nombre.' };
      }

      if (!Number.isFinite(levelMinScore) || !Number.isFinite(levelMaxScore)) {
        return { invalid: true, message: `El rango ${label} debe usar valores numéricos.` };
      }

      if (levelMinScore < minScore || levelMaxScore > maxScore || levelMaxScore < levelMinScore) {
        return { invalid: true, message: `El rango ${label} debe estar dentro de la escala de calificación.` };
      }

      return {
        key: normalizeText(level?.key) || `performance_level_${index + 1}_${slugifyAcademicStructureKey(label)}`,
        label,
        minScore: Number(levelMinScore.toFixed(2)),
        maxScore: Number(levelMaxScore.toFixed(2)),
        color: normalizeText(level?.color),
        order: Number(level?.order || (index + 1) * 10),
      };
    });

  const invalidLevel = performanceLevels.find((level) => level.invalid);
  if (invalidLevel) {
    return { ok: false, message: invalidLevel.message };
  }

  const sortedPerformanceLevels = performanceLevels.sort((left, right) => Number(left.minScore || 0) - Number(right.minScore || 0) || Number(left.order || 0) - Number(right.order || 0));
  for (let index = 1; index < sortedPerformanceLevels.length; index += 1) {
    const previousLevel = sortedPerformanceLevels[index - 1];
    const currentLevel = sortedPerformanceLevels[index];
    if (Number(currentLevel.minScore) <= Number(previousLevel.maxScore)) {
      return { ok: false, message: `El rango ${currentLevel.label} se cruza con ${previousLevel.label}.` };
    }
  }

  return {
    ok: true,
    gradingScale: {
      minScore: Number(minScore.toFixed(2)),
      maxScore: Number(maxScore.toFixed(2)),
      passingScore: Number(passingScore.toFixed(2)),
      performanceLevels: sortedPerformanceLevels,
    },
  };
}

function normalizeAcademicGradingScalesByLevel(rawScales = [], { levels = [] } = {}) {
  const levelMap = new Map((Array.isArray(levels) ? levels : [])
    .map((level) => [normalizeAcademicStructureLevelKey(level?.key || level?.label), level])
    .filter(([levelKey]) => levelKey));
  const entries = Array.isArray(rawScales)
    ? rawScales
    : Object.entries(rawScales || {}).map(([levelKey, gradingScale]) => ({ levelKey, ...(gradingScale || {}) }));
  const scalesByLevel = new Map();

  for (const entry of entries) {
    const levelKey = normalizeAcademicStructureLevelKey(entry?.levelKey || entry?.key);
    if (!levelKey || (levelMap.size > 0 && !levelMap.has(levelKey))) {
      continue;
    }

    const gradingScaleResult = normalizeAcademicGradingScale(entry?.gradingScale || entry);
    if (!gradingScaleResult.ok) {
      const levelLabel = normalizeText(levelMap.get(levelKey)?.label || levelKey);
      return { ok: false, message: `${levelLabel}: ${gradingScaleResult.message}` };
    }

    scalesByLevel.set(levelKey, {
      levelKey,
      ...gradingScaleResult.gradingScale,
    });
  }

  return {
    ok: true,
    gradingScalesByLevel: Array.from(scalesByLevel.values()),
  };
}

function serializeAcademicStructureConfiguration(configuration) {
  const allowedGradeKeys = new Set((Array.isArray(configuration?.grades) ? configuration.grades : []).map((grade) => normalizeAcademicStructureGradeKey(grade?.key || grade?.label)).filter(Boolean));
  const scheduleSettingsResult = normalizeAcademicScheduleSettings(configuration?.scheduleSettings, { allowedGradeKeys });
  const scheduleSettings = scheduleSettingsResult.ok ? scheduleSettingsResult.scheduleSettings : ACADEMIC_SCHEDULE_DEFAULT_SETTINGS;
  const levels = (Array.isArray(configuration?.levels) ? configuration.levels : [])
    .filter((level) => normalizeText(level?.status || 'active') !== 'archived')
    .map((level, levelIndex) => ({
      key: normalizeAcademicStructureLevelKey(level?.key || level?.label),
      label: normalizeText(level?.label || level?.key),
      order: Number(level?.order || (levelIndex + 1) * 10),
    }))
    .filter((level) => level.key)
    .sort((left, right) => Number(left.order || 0) - Number(right.order || 0) || compareAcademicLabels(left.label, right.label));

  const subjects = (Array.isArray(configuration?.subjects) ? configuration.subjects : [])
    .filter((subject) => normalizeText(subject?.status || 'active') !== 'archived')
    .map((subject, subjectIndex) => ({
      key: slugifyAcademicStructureKey(subject?.key || subject?.label),
      label: normalizeText(subject?.label || subject?.key),
      kind: normalizeAcademicStructureSubjectKind(subject?.kind),
      gradeKeys: uniqueNormalizedValues(subject?.gradeKeys).map((gradeKey) => normalizeAcademicStructureGradeKey(gradeKey)).filter(Boolean),
      order: Number(subject?.order || (subjectIndex + 1) * 10),
    }))
    .filter((subject) => subject.key)
    .sort((left, right) => Number(left.order || 0) - Number(right.order || 0) || compareAcademicLabels(left.label, right.label));

  const grades = (Array.isArray(configuration?.grades) ? configuration.grades : [])
    .filter((grade) => normalizeText(grade?.status || 'active') !== 'archived')
    .map((grade, gradeIndex) => {
      const normalizedGrade = {
        key: normalizeAcademicStructureGradeKey(grade?.key || grade?.label),
        label: normalizeText(grade?.label || grade?.key),
        levelKey: normalizeAcademicStructureLevelKey(grade?.levelKey),
        order: Number(grade?.order || (gradeIndex + 1) * 10),
        courses: Array.isArray(grade?.courses) ? grade.courses : [],
      };

      return {
        key: normalizedGrade.key,
        label: normalizedGrade.label,
        levelKey: normalizedGrade.levelKey,
        order: normalizedGrade.order,
        courses: resolveGradeCourses(normalizedGrade)
          .sort((left, right) => Number(left.order || 0) - Number(right.order || 0) || compareAcademicLabels(left.label, right.label)),
      };
    })
    .filter((grade) => grade.key)
    .sort((left, right) => Number(left.order || 0) - Number(right.order || 0) || compareAcademicLabels(left.label, right.label));

  const subjectKeySet = new Set(subjects.map((subject) => subject.key));
  const gradeKeySet = new Set(grades.map((grade) => grade.key));
  const teacherAvailability = (Array.isArray(configuration?.teachingAvailability) ? configuration.teachingAvailability : [])
    .map((item, index) => ({
      key: normalizeText(item?.key) || `teaching_availability_${index + 1}`,
      subjectKey: slugifyAcademicStructureKey(item?.subjectKey),
      teacherUserId: item?.teacherUserId ? String(item.teacherUserId) : null,
      gradeKeys: uniqueNormalizedValues(item?.gradeKeys).map((gradeKey) => normalizeAcademicStructureGradeKey(gradeKey)).filter((gradeKey) => gradeKeySet.has(gradeKey)),
      windows: (Array.isArray(item?.windows) ? item.windows : [])
        .map((windowItem) => ({
          weekday: Number(windowItem?.weekday || 0),
          startTime: normalizeAcademicScheduleTime(windowItem?.startTime),
          endTime: normalizeAcademicScheduleTime(windowItem?.endTime),
        }))
        .filter((windowItem) => ACADEMIC_SCHEDULE_WEEKDAYS.includes(windowItem.weekday) && windowItem.startTime && windowItem.endTime),
      order: Number(item?.order || (index + 1) * 10),
    }))
    .filter((item) => item.subjectKey && item.teacherUserId && item.gradeKeys.length > 0 && item.windows.length > 0)
    .sort((left, right) => Number(left.order || 0) - Number(right.order || 0));

  const subjectLoadTemplates = (Array.isArray(configuration?.subjectLoadTemplates) ? configuration.subjectLoadTemplates : [])
    .map((item, index) => ({
      key: normalizeText(item?.key) || `subject_load_template_${index + 1}`,
      subjectKey: slugifyAcademicStructureKey(item?.subjectKey),
      teacherUserId: item?.teacherUserId ? String(item.teacherUserId) : null,
      weeklyHours: Math.max(0, Math.min(40, Number(item?.weeklyHours || 0))),
      gradeKeys: uniqueNormalizedValues(item?.gradeKeys).map((gradeKey) => normalizeAcademicStructureGradeKey(gradeKey)).filter((gradeKey) => gradeKeySet.has(gradeKey)),
      order: Number(item?.order || (index + 1) * 10),
    }))
    .filter((item) => item.subjectKey && item.gradeKeys.length > 0)
    .sort((left, right) => Number(left.order || 0) - Number(right.order || 0));

  const gradeSchedules = (Array.isArray(configuration?.gradeSchedules) ? configuration.gradeSchedules : [])
    .map((gradeSchedule) => ({
      gradeKey: normalizeAcademicStructureGradeKey(gradeSchedule?.gradeKey),
      courseKey: normalizeText(gradeSchedule?.courseKey),
      subjectLoads: (Array.isArray(gradeSchedule?.subjectLoads) ? gradeSchedule.subjectLoads : [])
        .map((load, loadIndex) => ({
          subjectKey: slugifyAcademicStructureKey(load?.subjectKey),
          weeklyHours: Math.max(0, Math.min(40, Number(load?.weeklyHours || 0))),
          teacherUserId: load?.teacherUserId ? String(load.teacherUserId) : null,
          order: Number(load?.order || (loadIndex + 1) * 10),
        }))
        .filter((load) => load.subjectKey && subjectKeySet.has(load.subjectKey))
        .sort((left, right) => Number(left.order || 0) - Number(right.order || 0)),
      weeklySchedule: (Array.isArray(gradeSchedule?.weeklySchedule) ? gradeSchedule.weeklySchedule : [])
        .map((entry, entryIndex) => ({
          key: normalizeText(entry?.key) || buildAcademicScheduleSlotKey(entry?.weekday, entry?.block),
          weekday: Number(entry?.weekday || 0),
          block: Number(entry?.block || 0),
          startTime: normalizeAcademicScheduleTime(entry?.startTime),
          endTime: normalizeAcademicScheduleTime(entry?.endTime),
          entryType: normalizeText(entry?.entryType || 'class') === 'break' ? 'break' : 'class',
          subjectKey: normalizeText(entry?.entryType || 'class') === 'break' ? '' : slugifyAcademicStructureKey(entry?.subjectKey),
          breakKey: normalizeText(entry?.entryType || 'class') === 'break' ? normalizeText(entry?.breakKey) : '',
          breakLabel: normalizeText(entry?.entryType || 'class') === 'break' ? normalizeText(entry?.breakLabel) : '',
          teacherUserId: normalizeText(entry?.entryType || 'class') === 'break' ? null : (entry?.teacherUserId ? String(entry.teacherUserId) : null),
          order: Number(entry?.order || (entryIndex + 1) * 10),
        }))
        .filter((entry) => ACADEMIC_SCHEDULE_WEEKDAYS.includes(entry.weekday) && Number(entry.block) > 0 && entry.startTime && entry.endTime)
        .sort((left, right) => Number(left.weekday || 0) - Number(right.weekday || 0) || Number(left.block || 0) - Number(right.block || 0)),
      updatedAt: gradeSchedule?.updatedAt || null,
    }))
    .filter((gradeSchedule) => gradeSchedule.gradeKey && gradeKeySet.has(gradeSchedule.gradeKey));

  const scheduleBreaks = (Array.isArray(configuration?.scheduleBreaks) ? configuration.scheduleBreaks : [])
    .map((item, index) => ({
      key: normalizeText(item?.key) || `break_${index + 1}`,
      label: normalizeText(item?.label) || `Break ${index + 1}`,
      weekday: Number(item?.weekday || 0),
      startTime: normalizeAcademicScheduleTime(item?.startTime),
      endTime: normalizeAcademicScheduleTime(item?.endTime),
      gradeKeys: uniqueNormalizedValues(item?.gradeKeys).map((gradeKey) => normalizeAcademicStructureGradeKey(gradeKey)).filter((gradeKey) => gradeKeySet.has(gradeKey)),
      order: Number(item?.order || (index + 1) * 10),
    }))
    .filter((item) => item.weekday && item.startTime && item.endTime && item.gradeKeys.length > 0)
    .sort((left, right) => Number(left.weekday || 0) - Number(right.weekday || 0) || String(left.startTime || '').localeCompare(String(right.startTime || '')) || String(left.endTime || '').localeCompare(String(right.endTime || '')) || Number(left.order || 0) - Number(right.order || 0));

  const academicPeriods = (Array.isArray(configuration?.academicPeriods) ? configuration.academicPeriods : createDefaultAcademicStructurePeriods())
    .map((period, index) => ({
      key: normalizeText(period?.key) || `period_${index + 1}`,
      name: normalizeText(period?.name) || `Periodo ${index + 1}`,
      weight: Number(period?.weight || 0),
      order: Number(period?.order || (index + 1) * 10),
      startDate: period?.startDate || null,
      endDate: period?.endDate || null,
    }))
    .sort((left, right) => Number(left.order || 0) - Number(right.order || 0));
  const gradingScaleResult = normalizeAcademicGradingScale(configuration?.gradingScale || {});
  const gradingScalesByLevelResult = normalizeAcademicGradingScalesByLevel(configuration?.gradingScalesByLevel || [], { levels });

  return {
    academicYear: normalizeText(configuration?.academicYear) || getCurrentAcademicYear(),
    levels,
    subjects,
    grades,
    scheduleSettings: {
      groups: scheduleSettings.groups.map((group, index) => {
        const groupBlocks = buildAcademicScheduleBlocksFromGroup(group);
        return {
          key: group.key || `schedule_group_${index + 1}`,
          name: normalizeText(group.name) || `Jornada ${index + 1}`,
          weekdays: Array.isArray(group.weekdays) ? group.weekdays : [],
          gradeKeys: Array.isArray(group.gradeKeys) ? group.gradeKeys.filter((gradeKey) => gradeKeySet.has(gradeKey)) : [],
          dayStartTime: group.dayStartTime,
          blocks: groupBlocks.map((slot) => ({
            block: slot.block,
            durationMinutes: slot.durationMinutes,
            startTime: slot.startTime,
            endTime: slot.endTime,
            label: slot.label,
            order: slot.order,
          })),
          order: Number(group.order || (index + 1) * 10),
        };
      }),
    },
    scheduleBreaks,
    teachingAvailability: teacherAvailability,
    subjectLoadTemplates,
    gradeSchedules,
    academicPeriods,
    gradingScale: gradingScaleResult.ok ? gradingScaleResult.gradingScale : DEFAULT_ACADEMIC_GRADING_SCALE,
    gradingScalesByLevel: gradingScalesByLevelResult.ok ? gradingScalesByLevelResult.gradingScalesByLevel : [],
  };
}

function readSchoolCreationMappedArray(map, candidates) {
  if (!map || typeof map !== 'object') return [];
  const exactCandidates = Array.from(new Set(candidates.map(normalizeText).filter(Boolean)));
  for (const candidate of exactCandidates) {
    if (Array.isArray(map[candidate])) return map[candidate];
  }

  const normalizedCandidates = new Set(exactCandidates.map(slugifyAcademicStructureKey).filter(Boolean));
  const matchedEntry = Object.entries(map).find(([key, value]) => Array.isArray(value) && normalizedCandidates.has(slugifyAcademicStructureKey(key)));
  return matchedEntry ? matchedEntry[1] : [];
}

function buildAcademicStructureFromSchoolCreationPayload(payload = {}) {
  const availableLevels = Array.isArray(payload.availableLevels) ? payload.availableLevels : [];
  const selectedIds = new Set((Array.isArray(payload.selectedLevelIds) ? payload.selectedLevelIds : []).map(normalizeText).filter(Boolean));
  const levels = availableLevels
    .filter((level) => selectedIds.has(normalizeText(level?.id)))
    .map((level, index) => ({
      key: normalizeAcademicStructureLevelKey(level?.id || level?.name) || `nivel_${index + 1}`,
      sourceId: normalizeText(level?.id),
      label: normalizeText(level?.name || level?.id) || `Nivel ${index + 1}`,
      order: (index + 1) * 10,
      status: 'active',
    }));
  const gradesByLevel = payload.gradesByLevel || {};
  const coursesByGrade = payload.coursesByGrade || {};
  const singleCourseGrades = payload.singleCourseGrades || {};
  const grades = [];

  levels.forEach((level) => {
    const sourceLevelId = level.sourceId || level.key;
    const rawGrades = readSchoolCreationMappedArray(gradesByLevel, [sourceLevelId, level.key, level.label]);
    const fallbackGrades = rawGrades.length > 0
      ? rawGrades
      : SCHOOL_CREATION_DEFAULT_GRADES_BY_LEVEL[slugifyAcademicStructureKey(sourceLevelId)] || SCHOOL_CREATION_DEFAULT_GRADES_BY_LEVEL[slugifyAcademicStructureKey(level.key)] || [];
    fallbackGrades.map(normalizeText).filter(Boolean).forEach((gradeLabel, gradeIndex) => {
      const gradeKey = `${sourceLevelId}:${gradeLabel}`;
      const configuredCourses = readSchoolCreationMappedArray(coursesByGrade, [gradeKey, `${level.key}:${gradeLabel}`, gradeLabel]).map(normalizeText).filter(Boolean);
      const courseLabels = singleCourseGrades[gradeKey] || configuredCourses.length === 0 ? [gradeLabel] : configuredCourses;
      grades.push({
        sourceKey: gradeKey,
        key: normalizeAcademicStructureGradeKey(gradeKey),
        label: gradeLabel,
        levelKey: level.key,
        order: grades.length * 10 + gradeIndex + 10,
        status: 'active',
        courses: courseLabels.map((courseLabel, courseIndex) => ({
          key: normalizeAcademicStructureGradeKey(`${gradeKey}:${slugifyAcademicStructureKey(courseLabel) || `curso_${courseIndex + 1}`}`),
          label: courseLabel,
          section: courseLabel,
          order: (courseIndex + 1) * 10,
          status: 'active',
        })),
      });
    });
  });

  const subjectMapByGrade = payload.subjectMapByGrade || {};
  const subjects = (Array.isArray(payload.subjects) ? payload.subjects : [])
    .map(normalizeText)
    .filter(Boolean)
    .map((subject, index) => ({
      key: slugifyAcademicStructureKey(subject) || `asignatura_${index + 1}`,
      label: subject,
      kind: 'principal',
      gradeKeys: grades
        .filter((grade) => readSchoolCreationMappedArray(subjectMapByGrade, [grade.sourceKey, grade.key, grade.label]).map(normalizeText).includes(subject))
        .map((grade) => grade.key),
      order: (index + 1) * 10,
      status: 'active',
    }));

  return { levels, grades, subjects, academicPeriods: buildAcademicPeriodsFromSchoolCreationPayload(payload) };
}

function buildAcademicPeriodsFromSchoolCreationPayload(payload = {}) {
  if (!Array.isArray(payload.periods) || payload.periods.length === 0) {
    return [];
  }

  const normalizedPeriods = normalizeAcademicPeriodsConfiguration(payload.periods || []);
  return normalizedPeriods.ok ? normalizedPeriods.periods : [];
}

function isDefaultAcademicStructurePeriods(periods = []) {
  if (!Array.isArray(periods) || periods.length === 0) {
    return true;
  }

  if (periods.length !== 1) {
    return false;
  }

  const [period] = periods;
  return normalizeText(period?.key) === 'period_1'
    && normalizeText(period?.name).toLowerCase() === 'periodo 1'
    && Number(period?.weight || 0) === 100
    && !period?.startDate
    && !period?.endDate;
}

function buildRecoveredGradeLookup(grades = []) {
  const lookup = new Map();
  (Array.isArray(grades) ? grades : []).forEach((grade) => {
    [grade?.key, grade?.sourceKey, grade?.label]
      .map((value) => normalizeAcademicStructureGradeKey(value))
      .filter(Boolean)
      .forEach((key) => lookup.set(key, grade));
  });
  return lookup;
}

function shouldReplaceRecoveredCourses(currentCourses = [], recoveredCourses = []) {
  if (!Array.isArray(recoveredCourses) || recoveredCourses.length === 0) return false;
  if (!Array.isArray(currentCourses) || currentCourses.length === 0) return true;
  const currentLabels = currentCourses.map((course) => normalizeText(course?.label || course?.key)).filter(Boolean);
  const recoveredLabels = recoveredCourses.map((course) => normalizeText(course?.label || course?.key)).filter(Boolean);
  if (recoveredLabels.length > currentLabels.length) return true;
  if (currentLabels.length === 1 && recoveredLabels.length === 1) return false;
  return currentLabels.some((label) => /\s-\s/.test(label));
}

async function recoverAcademicStructureFromSchoolCreationSnapshot(schoolId, configuration) {
  const snapshot = await SchoolCreationSnapshot.findOne({ schoolId }).sort({ completedAt: -1, updatedAt: -1 }).lean();
  const recovered = buildAcademicStructureFromSchoolCreationPayload(snapshot?.payload || {});
  if (recovered.grades.length === 0 && recovered.academicPeriods.length === 0) return false;

  let changed = false;
  const hasGrades = Array.isArray(configuration.grades) && configuration.grades.length > 0;

  if (recovered.levels.length > 0 && (!Array.isArray(configuration.levels) || configuration.levels.length === 0)) {
    configuration.levels = recovered.levels;
    changed = true;
  }

  if (recovered.grades.length > 0 && !hasGrades) {
    configuration.grades = recovered.grades;
    configuration.gradeSchedules = recovered.grades.map((grade) => ({
      gradeKey: grade.key,
      subjectLoads: [],
      weeklySchedule: [],
      updatedAt: new Date(),
    }));
    changed = true;
  } else if (recovered.grades.length > 0) {
    const recoveredGradeLookup = buildRecoveredGradeLookup(recovered.grades);
    configuration.grades = configuration.grades.map((grade) => {
      const gradeKey = normalizeAcademicStructureGradeKey(grade?.key || grade?.label);
      const recoveredGrade = recoveredGradeLookup.get(gradeKey);
      const currentGrade = grade.toObject ? grade.toObject() : grade;
      if (!recoveredGrade || !shouldReplaceRecoveredCourses(currentGrade.courses, recoveredGrade.courses)) {
        return grade;
      }

      changed = true;
      return {
        ...currentGrade,
        courses: recoveredGrade.courses,
      };
    });
  }

  if (recovered.subjects.length > 0 && (!Array.isArray(configuration.subjects) || configuration.subjects.length === 0)) {
    configuration.subjects = recovered.subjects;
    changed = true;
  } else if (recovered.subjects.length > 0) {
    const recoveredSubjectMap = new Map(recovered.subjects.map((subject) => [subject.key, subject]));
    configuration.subjects = configuration.subjects.map((subject) => {
      const subjectKey = slugifyAcademicStructureKey(subject?.key || subject?.label);
      const recoveredSubject = recoveredSubjectMap.get(subjectKey);
      const hasLinkedGrades = Array.isArray(subject?.gradeKeys) && subject.gradeKeys.length > 0;
      if (!recoveredSubject || hasLinkedGrades || recoveredSubject.gradeKeys.length === 0) {
        return subject;
      }

      changed = true;
      return {
        ...(subject.toObject ? subject.toObject() : subject),
        gradeKeys: recoveredSubject.gradeKeys,
      };
    });
  }

  if (recovered.academicPeriods.length > 0 && isDefaultAcademicStructurePeriods(configuration.academicPeriods)) {
    configuration.academicPeriods = recovered.academicPeriods;
    changed = true;
  }

  return changed;
}

async function ensureAcademicStructureConfiguration(schoolId) {
  const existingConfiguration = await AcademicStructure.findOne({ schoolId });

  const configuration = existingConfiguration || new AcademicStructure({
    schoolId,
    academicYear: getCurrentAcademicYear(),
    levels: [],
    subjects: [],
    grades: [],
    scheduleSettings: ACADEMIC_SCHEDULE_DEFAULT_SETTINGS,
    scheduleBreaks: [],
    teachingAvailability: [],
    subjectLoadTemplates: [],
    gradeSchedules: [],
    academicPeriods: createDefaultAcademicStructurePeriods(),
    gradingScale: DEFAULT_ACADEMIC_GRADING_SCALE,
  });

  const recoveredFromSnapshot = await recoverAcademicStructureFromSchoolCreationSnapshot(schoolId, configuration);
  const plainConfiguration = serializeAcademicStructureConfiguration(configuration);
  let changed = !existingConfiguration || recoveredFromSnapshot;

  if (!normalizeText(configuration.academicYear)) {
    plainConfiguration.academicYear = getCurrentAcademicYear();
    changed = true;
  }

  if (changed) {
    configuration.academicYear = plainConfiguration.academicYear;
    configuration.levels = Array.isArray(configuration.levels) ? configuration.levels : [];
    configuration.subjects = Array.isArray(configuration.subjects) ? configuration.subjects : [];
    configuration.grades = Array.isArray(configuration.grades) ? configuration.grades : [];
    const validGradeKeys = new Set((Array.isArray(configuration.grades) ? configuration.grades : []).map((grade) => normalizeAcademicStructureGradeKey(grade?.key || grade?.label)).filter(Boolean));
    const normalizedScheduleSettings = normalizeAcademicScheduleSettings(configuration.scheduleSettings, { allowedGradeKeys: validGradeKeys });
    configuration.scheduleSettings = normalizedScheduleSettings.ok
      ? normalizedScheduleSettings.scheduleSettings
      : ACADEMIC_SCHEDULE_DEFAULT_SETTINGS;
    configuration.scheduleBreaks = Array.isArray(configuration.scheduleBreaks) ? configuration.scheduleBreaks : [];
    configuration.teachingAvailability = Array.isArray(configuration.teachingAvailability) ? configuration.teachingAvailability : [];
    configuration.subjectLoadTemplates = Array.isArray(configuration.subjectLoadTemplates) ? configuration.subjectLoadTemplates : [];
    configuration.gradeSchedules = Array.isArray(configuration.gradeSchedules) ? configuration.gradeSchedules : [];
    configuration.academicPeriods = Array.isArray(configuration.academicPeriods) && configuration.academicPeriods.length
      ? configuration.academicPeriods
      : createDefaultAcademicStructurePeriods();
    const gradingScaleResult = normalizeAcademicGradingScale(configuration.gradingScale || {});
    configuration.gradingScale = gradingScaleResult.ok ? gradingScaleResult.gradingScale : DEFAULT_ACADEMIC_GRADING_SCALE;
    syncAcademicGradeSchedulesFromTemplates(configuration);
    applyAcademicScheduleBreaksToConfiguration(configuration);
    await configuration.save();
  }

  return changed ? configuration : existingConfiguration || configuration;
}

function normalizeBenefitRules(rules = []) {
  return (Array.isArray(rules) ? rules : [])
    .map((rule, index) => {
      const discountType = normalizeText(rule?.discountType) === 'fixed' ? 'fixed' : 'percent';
      return {
        label: normalizeText(rule?.label) || `Beneficio ${index + 1}`,
        startDay: Math.min(31, Math.max(1, Number(rule?.startDay || 1))),
        endDay: Math.min(31, Math.max(1, Number(rule?.endDay || 10))),
        discountType,
        discountPercent: discountType === 'percent' ? Math.min(100, Math.max(0, Number(rule?.discountPercent || 0))) : 0,
        fixedAmountsByGrade: normalizeBenefitFixedAmountsByGrade(rule?.fixedAmountsByGrade),
      };
    })
    .filter((rule) => rule.endDay >= rule.startDay)
    .sort((left, right) => left.startDay - right.startDay || getMaxBenefitFixedAmount(right) - getMaxBenefitFixedAmount(left) || right.discountPercent - left.discountPercent);
}

function normalizeEnrollmentBenefitRules(rules = []) {
  return (Array.isArray(rules) ? rules : [])
    .map((rule, index) => {
      const discountType = normalizeText(rule?.discountType) === 'fixed' ? 'fixed' : 'percent';
      const startDate = parseAcademicCalendarDate(rule?.startDate);
      const endDate = parseAcademicCalendarDate(rule?.endDate);
      if (!startDate || !endDate) {
        return null;
      }

      const firstDate = startDate.getTime() <= endDate.getTime() ? startDate : endDate;
      const lastDate = startDate.getTime() <= endDate.getTime() ? endDate : startDate;
      return {
        label: normalizeText(rule?.label) || `Beneficio matricula ${index + 1}`,
        startDate: firstDate,
        endDate: lastDate,
        discountType,
        discountPercent: discountType === 'percent' ? Math.min(100, Math.max(0, Number(rule?.discountPercent || 0))) : 0,
        fixedAmountsByGrade: normalizeBenefitFixedAmountsByGrade(rule?.fixedAmountsByGrade),
        targetGradeKeys: Array.isArray(rule?.targetGradeKeys) ? rule.targetGradeKeys.map(normalizeText).filter(Boolean) : [],
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.startDate.getTime() - right.startDate.getTime() || right.discountPercent - left.discountPercent || getMaxBenefitFixedAmount(right) - getMaxBenefitFixedAmount(left));
}

function normalizeBenefitFixedAmountsByGrade(rawAmounts = {}) {
  const entries = rawAmounts instanceof Map ? Array.from(rawAmounts.entries()) : Object.entries(rawAmounts || {});
  return entries.reduce((accumulator, [grade, amount]) => {
    const normalizedGrade = normalizeText(grade).toLowerCase();
    if (!normalizedGrade) {
      return accumulator;
    }

    accumulator[normalizedGrade] = Math.max(0, Math.round(Number(amount || 0)));
    return accumulator;
  }, {});
}

function getMaxBenefitFixedAmount(rule = {}) {
  return Math.max(0, ...Object.values(normalizeBenefitFixedAmountsByGrade(rule.fixedAmountsByGrade)).map((amount) => Number(amount || 0)));
}

  const DEFAULT_ACADEMIC_MONTHLY_DUE_DAY = 10;

  function normalizeAcademicInstallmentCount(value, defaultValue = 1) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return defaultValue;
    }

    return Math.min(12, Math.max(1, Math.round(parsed)));
  }

  function normalizeAcademicAdditionalDiscountPercent(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return 0;
    }

    return Math.min(100, Math.max(0, parsed));
  }

  function splitAcademicAmountIntoInstallments(totalAmount, installmentCount) {
    const safeTotal = Math.max(0, Math.round(Number(totalAmount || 0)));
    const safeInstallments = normalizeAcademicInstallmentCount(installmentCount, 1);
    if (safeTotal <= 0) {
      return [];
    }

    const baseAmount = Math.floor(safeTotal / safeInstallments);
    let remainder = safeTotal % safeInstallments;

    return Array.from({ length: safeInstallments }, () => {
      const nextAmount = baseAmount + (remainder > 0 ? 1 : 0);
      if (remainder > 0) {
        remainder -= 1;
      }
      return nextAmount;
    }).filter((amount) => amount > 0);
  }

  function buildAcademicInstallmentDueDate(referenceDateValue = new Date(), installmentIndex = 0) {
    const dueDate = new Date(referenceDateValue);
    if (Number.isNaN(dueDate.getTime())) {
      return new Date();
    }

    dueDate.setHours(0, 0, 0, 0);
    dueDate.setMonth(dueDate.getMonth() + Math.max(0, Number(installmentIndex || 0)));
    return dueDate;
  }

  function parseAcademicCalendarDate(value) {
    if (!value) {
      return null;
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
    }

    const normalized = normalizeText(value);
    if (!normalized) {
      return null;
    }

    const isoDateMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
    if (isoDateMatch) {
      return new Date(Date.UTC(Number(isoDateMatch[1]), Number(isoDateMatch[2]) - 1, Number(isoDateMatch[3])));
    }

    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
  }

  function normalizeAcademicDueDateForBogota(value) {
    const parsed = parseAcademicCalendarDate(value);
    if (!parsed) {
      return null;
    }

    return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate(), 5, 0, 0, 0));
  }

  function buildAcademicAnnualTuitionInstallmentDueDate(referenceDateValue = new Date(), installmentIndex = 0) {
    const baseDate = normalizeAcademicDueDateForBogota(referenceDateValue) || normalizeAcademicDueDateForBogota(new Date());
    const targetMonth = baseDate.getUTCMonth() + Math.max(0, Number(installmentIndex || 0));
    const targetYear = baseDate.getUTCFullYear() + Math.floor(targetMonth / 12);
    const normalizedTargetMonth = ((targetMonth % 12) + 12) % 12;
    const lastTargetDay = new Date(Date.UTC(targetYear, normalizedTargetMonth + 1, 0)).getUTCDate();
    return new Date(Date.UTC(targetYear, normalizedTargetMonth, Math.min(baseDate.getUTCDate(), lastTargetDay), 5, 0, 0, 0));
  }

  function startOfAcademicMonthUtc(date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  }

  function getAcademicMonthDiff(startDate, endDate) {
    return ((endDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12) + (endDate.getUTCMonth() - startDate.getUTCMonth());
  }

  function normalizeAcademicLateEnrollmentSurchargeType(value) {
    const normalized = normalizeText(value);
    return ['percent', 'fixed'].includes(normalized) ? normalized : 'none';
  }

  function resolveAcademicSchoolYearLevelSetting(configuration = {}, grade = '', options = {}) {
    const { academicGrades = [] } = options;
    const aliases = new Set(getFeeGradeAliases(grade));
    const schoolYearLevels = Array.isArray(configuration?.schoolYearLevels) ? configuration.schoolYearLevels : [];

    const byGradeKeys = schoolYearLevels.find((levelSetting) => {
      const gradeKeys = Array.isArray(levelSetting?.gradeKeys) ? levelSetting.gradeKeys : [];
      return gradeKeys.some((gradeKey) => getFeeGradeAliases(gradeKey).some((alias) => aliases.has(alias)));
    });
    if (byGradeKeys) {
      return byGradeKeys;
    }

    const matchedGrade = (Array.isArray(academicGrades) ? academicGrades : []).find((gradeItem) => {
      const gradeAliases = getFeeGradeAliases(gradeItem?.key || gradeItem?.grade);
      return gradeAliases.some((alias) => aliases.has(alias));
    });
    const levelKey = normalizeText(matchedGrade?.levelKey).toLowerCase();
    if (!levelKey) {
      return null;
    }

    return schoolYearLevels.find((levelSetting) => normalizeText(levelSetting?.levelKey).toLowerCase() === levelKey) || null;
  }

  function normalizeAcademicSchoolYearConfiguration(configuration = {}, grade = '', options = {}) {
    const levelSetting = resolveAcademicSchoolYearLevelSetting(configuration, grade, options);
    const sourceConfiguration = levelSetting || configuration || {};
    const currentYear = new Date().getUTCFullYear();
    const fallbackStartDate = new Date(Date.UTC(currentYear, 0, 1));
    const fallbackEndDate = new Date(Date.UTC(currentYear, 11, 31));
    const parsedStartDate = parseAcademicCalendarDate(sourceConfiguration?.schoolYearStartDate || sourceConfiguration?.startDate || configuration?.schoolYearStartDate || configuration?.startDate) || fallbackStartDate;
    const parsedEndDate = parseAcademicCalendarDate(sourceConfiguration?.schoolYearEndDate || sourceConfiguration?.endDate || configuration?.schoolYearEndDate || configuration?.endDate) || fallbackEndDate;
    const startDate = parsedStartDate.getTime() <= parsedEndDate.getTime() ? parsedStartDate : parsedEndDate;
    const endDate = parsedStartDate.getTime() <= parsedEndDate.getTime() ? parsedEndDate : parsedStartDate;

    return {
      startDate,
      endDate,
      totalMonths: Math.max(1, getAcademicMonthDiff(startOfAcademicMonthUtc(startDate), startOfAcademicMonthUtc(endDate)) + 1),
      lateEnrollmentSurchargeType: normalizeAcademicLateEnrollmentSurchargeType(sourceConfiguration?.lateEnrollmentSurchargeType),
      lateEnrollmentSurchargeValue: Math.max(0, Number(sourceConfiguration?.lateEnrollmentSurchargeValue || 0)),
      enrollmentBenefitRules: normalizeEnrollmentBenefitRules(configuration?.enrollmentBenefitRules || []),
      levelKey: normalizeText(levelSetting?.levelKey),
      levelLabel: normalizeText(levelSetting?.label),
    };
  }

function normalizeAcademicSchoolYearLevelSettings(levelSettings = []) {
  return (Array.isArray(levelSettings) ? levelSettings : [])
    .map((item) => {
      const levelKey = normalizeText(item?.levelKey);
      const parsedStartDate = parseAcademicCalendarDate(item?.schoolYearStartDate || item?.startDate);
      const parsedEndDate = parseAcademicCalendarDate(item?.schoolYearEndDate || item?.endDate);
      const startDate = parsedStartDate && parsedEndDate && parsedStartDate.getTime() > parsedEndDate.getTime() ? parsedEndDate : parsedStartDate;
      const endDate = parsedStartDate && parsedEndDate && parsedStartDate.getTime() > parsedEndDate.getTime() ? parsedStartDate : parsedEndDate;
      const surchargeType = normalizeAcademicLateEnrollmentSurchargeType(item?.lateEnrollmentSurchargeType);
      return {
        levelKey,
        label: normalizeText(item?.label),
        gradeKeys: uniqueNormalizedValues(item?.gradeKeys).map((gradeKey) => normalizeAcademicStructureGradeKey(gradeKey)).filter(Boolean),
        schoolYearStartDate: startDate || null,
        schoolYearEndDate: endDate || null,
        lateEnrollmentSurchargeType: surchargeType,
        lateEnrollmentSurchargeValue: surchargeType === 'none' ? 0 : Math.max(0, Number(item?.lateEnrollmentSurchargeValue || 0)),
      };
    })
    .filter((item) => item.levelKey && item.gradeKeys.length > 0 && item.schoolYearStartDate && item.schoolYearEndDate);
}

  function doesEnrollmentBenefitRuleApplyToGrade(rule = {}, grade = '') {
    const aliases = new Set(getFeeGradeAliases(grade));
    const targetGradeKeys = Array.isArray(rule?.targetGradeKeys) ? rule.targetGradeKeys.flatMap(getFeeGradeAliases) : [];
    if (targetGradeKeys.length > 0) {
      return targetGradeKeys.some((gradeKey) => aliases.has(gradeKey));
    }

    const amountsByGrade = normalizeBenefitFixedAmountsByGrade(rule?.fixedAmountsByGrade || {});
    const hasFixedAmountsByGrade = Object.keys(amountsByGrade).length > 0;
    if (normalizeText(rule?.discountType) === 'fixed' || hasFixedAmountsByGrade) {
      return getFixedBenefitAmountForGrade(rule, grade) > 0;
    }

    return true;
  }

  function getApplicableEnrollmentBenefitRule(enrollmentBenefitRules = [], entryDateValue = null, grade = '') {
    const entryDate = parseAcademicCalendarDate(entryDateValue);
    if (!entryDate) {
      return null;
    }

    return (Array.isArray(enrollmentBenefitRules) ? enrollmentBenefitRules : []).find((rule) => {
      if (!doesEnrollmentBenefitRuleApplyToGrade(rule, grade)) {
        return false;
      }

      const startDate = parseAcademicCalendarDate(rule?.startDate);
      const endDate = parseAcademicCalendarDate(rule?.endDate);
      if (!startDate || !endDate) {
        return false;
      }

      return entryDate.getTime() >= startDate.getTime() && entryDate.getTime() <= endDate.getTime();
    }) || null;
  }

  function resolveActiveEnrollmentBenefitDueDate(configuration = {}, grade = '', referenceDate = new Date()) {
    const schoolYearConfiguration = normalizeAcademicSchoolYearConfiguration(configuration || {}, grade);
    const activeRule = getApplicableEnrollmentBenefitRule(schoolYearConfiguration.enrollmentBenefitRules, referenceDate, grade);
    return activeRule?.endDate ? normalizeAcademicDueDateForBogota(activeRule.endDate) : null;
  }

  function resolveAcademicAnnualTuitionFirstDueDate({ feeConfiguration = {}, grade = '', fallbackDate = new Date(), referenceDate = new Date(), enrollmentPricing = null, billingProfile = null } = {}) {
    return resolveActiveEnrollmentBenefitDueDate(feeConfiguration, grade, referenceDate)
      || normalizeAcademicDueDateForBogota(enrollmentPricing?.enrollmentBenefitEndDate)
      || normalizeAcademicDueDateForBogota(billingProfile?.annualTuitionDueDate)
      || normalizeAcademicDueDateForBogota(fallbackDate)
      || normalizeAcademicDueDateForBogota(new Date());
  }

  function resolveAcademicEnrollmentBenefitDiscountAmount(amount, benefitRule = null, grade = '') {
    const safeAmount = Math.max(0, Math.round(Number(amount || 0)));
    if (!benefitRule || safeAmount <= 0) {
      return 0;
    }

    if (normalizeText(benefitRule.discountType) === 'fixed') {
      return Math.min(safeAmount, Math.max(0, Math.round(getFixedBenefitAmountForGrade(benefitRule, grade))));
    }

    return Math.min(safeAmount, Math.round((safeAmount * Math.min(100, Math.max(0, Number(benefitRule.discountPercent || 0)))) / 100));
  }

  function resolveAcademicLateEnrollmentSurchargeAmount(baseAmount, elapsedMonths, configuration = {}) {
    if (baseAmount <= 0 || elapsedMonths <= 0) {
      return 0;
    }

    if (configuration.lateEnrollmentSurchargeType === 'percent') {
      return Math.round((baseAmount * configuration.lateEnrollmentSurchargeValue) / 100);
    }

    if (configuration.lateEnrollmentSurchargeType === 'fixed') {
      return Math.round(configuration.lateEnrollmentSurchargeValue);
    }

    return 0;
  }

  function calculateProratedAcademicEnrollmentFee(annualAmount, entryDateValue = null, configuration = {}, grade = '') {
    const safeAnnualAmount = Math.max(0, Math.round(Number(annualAmount || 0)));
    const schoolYearConfiguration = normalizeAcademicSchoolYearConfiguration(configuration, grade);
    const parsedEntryDate = parseAcademicCalendarDate(entryDateValue);

    if (!parsedEntryDate) {
      return {
        baseAmount: safeAnnualAmount,
        amount: safeAnnualAmount,
        totalMonths: schoolYearConfiguration.totalMonths,
        remainingMonths: schoolYearConfiguration.totalMonths,
        elapsedMonths: 0,
        lateEnrollmentSurchargeAmount: 0,
        isLateEnrollment: false,
        enrollmentBenefitDiscountAmount: 0,
        enrollmentBenefitLabel: '',
        enrollmentBenefitStartDate: null,
        enrollmentBenefitEndDate: null,
      };
    }

    const entryMonth = startOfAcademicMonthUtc(parsedEntryDate);
    const schoolYearStartMonth = startOfAcademicMonthUtc(schoolYearConfiguration.startDate);
    const schoolYearEndMonth = startOfAcademicMonthUtc(schoolYearConfiguration.endDate);
    const rawElapsedMonths = entryMonth.getTime() > schoolYearStartMonth.getTime()
      ? getAcademicMonthDiff(schoolYearStartMonth, entryMonth)
      : 0;

    if (entryMonth.getTime() > schoolYearEndMonth.getTime()) {
      return {
        baseAmount: 0,
        amount: 0,
        totalMonths: schoolYearConfiguration.totalMonths,
        remainingMonths: 0,
        elapsedMonths: schoolYearConfiguration.totalMonths,
        lateEnrollmentSurchargeAmount: 0,
        isLateEnrollment: false,
        enrollmentBenefitDiscountAmount: 0,
        enrollmentBenefitLabel: '',
        enrollmentBenefitStartDate: null,
        enrollmentBenefitEndDate: null,
      };
    }

    const elapsedMonths = Math.max(0, Math.min(schoolYearConfiguration.totalMonths - 1, rawElapsedMonths));
    const remainingMonths = Math.max(1, Math.min(schoolYearConfiguration.totalMonths, schoolYearConfiguration.totalMonths - elapsedMonths));
    const baseAmount = Math.round((safeAnnualAmount * remainingMonths) / schoolYearConfiguration.totalMonths);
    const lateEnrollmentSurchargeAmount = resolveAcademicLateEnrollmentSurchargeAmount(baseAmount, elapsedMonths, schoolYearConfiguration);
    const amountBeforeDiscount = baseAmount + lateEnrollmentSurchargeAmount;
    const enrollmentBenefitRule = getApplicableEnrollmentBenefitRule(schoolYearConfiguration.enrollmentBenefitRules, parsedEntryDate, grade);
    const enrollmentBenefitDiscountAmount = resolveAcademicEnrollmentBenefitDiscountAmount(amountBeforeDiscount, enrollmentBenefitRule, grade);

    return {
      baseAmount,
      amount: Math.max(0, amountBeforeDiscount - enrollmentBenefitDiscountAmount),
      totalMonths: schoolYearConfiguration.totalMonths,
      remainingMonths,
      elapsedMonths,
      lateEnrollmentSurchargeAmount,
      isLateEnrollment: lateEnrollmentSurchargeAmount > 0,
      enrollmentBenefitDiscountAmount,
      enrollmentBenefitLabel: normalizeText(enrollmentBenefitRule?.label),
      enrollmentBenefitStartDate: enrollmentBenefitRule?.startDate || null,
      enrollmentBenefitEndDate: enrollmentBenefitRule?.endDate || null,
    };
  }

  function resolveAcademicMonthlyDiscountConfig(billingProfile, referenceDate = new Date()) {
    const benefitRule = getApplicableBenefitRule(billingProfile?.benefitRules || [], referenceDate);
    const isFixedBenefit = normalizeText(benefitRule?.discountType) === 'fixed';
    const baseDiscountPercent = isFixedBenefit ? 0 : Math.min(100, Math.max(0, Number(benefitRule?.discountPercent || 0)));
    const fixedDiscountAmount = isFixedBenefit ? getFixedBenefitAmountForGrade(benefitRule, billingProfile?.grade) : 0;
    const additionalDiscount = normalizeAdditionalPensionDiscount(billingProfile);

    return {
      discountPercent: baseDiscountPercent,
      fixedDiscountAmount,
      benefitLabel: normalizeText(benefitRule?.label) || '',
      benefitWindowLabel: getAcademicBenefitWindowLabel(benefitRule),
      additionalDiscount,
    };
  }

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeHeaderKey(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function normalizeImportedDocumentType(value) {
  const normalized = normalizeHeaderKey(value);
  if (!normalized) return '';
  if (['cc', 'cedula', 'ceduladeciudadania'].includes(normalized)) return 'CC';
  if (['ti', 'tarjetadeidentidad'].includes(normalized)) return 'TI';
  if (['ce', 'ceduladeextranjeria'].includes(normalized)) return 'CE';
  if (['pp', 'pasaporte'].includes(normalized)) return 'PP';
  if (['nit'].includes(normalized)) return 'NIT';
  return '';
}

function normalizeImportedGender(value) {
  const normalized = normalizeHeaderKey(value);
  if (!normalized) return '';
  if (['female', 'femenino', 'mujer', 'f'].includes(normalized)) return 'female';
  if (['male', 'masculino', 'hombre', 'm'].includes(normalized)) return 'male';
  if (['other', 'otro', 'otra', 'o'].includes(normalized)) return 'other';
  return '';
}

function parseAcademicDatabaseDateCell(value) {
  if (value == null || value === '') {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
    }
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return new Date(`${normalized}T00:00:00.000Z`);
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(normalized)) {
    const [day, month, year] = normalized.split('/').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

const ACADEMIC_DATABASE_IMPORT_COLUMN_ALIASES = {
  grade: ['grado'],
  lastName: ['apellidos', 'apellido'],
  firstName: ['nombres', 'nombre'],
  gender: ['genero', 'sexo'],
  studentDocumentType: ['tipodocalumno', 'tipodocumentoalumno', 'tipodocalumna', 'tipodocumento'],
  studentDocumentNumber: ['numerodocalumno', 'numerodocumentoalumno', 'numerodocumento'],
  birthDate: ['fechanacimiento', 'fechadenacimiento'],
  age: ['edad'],
  bloodType: ['tiposangre'],
  birthPlace: ['lugarnacimiento'],
  address: ['direccion'],
  motherName: ['nombremadre', 'madre'],
  motherDocumentType: ['tipodocmadre', 'tipodocumentomadre'],
  motherDocumentNumber: ['numerodocmadre', 'numerodocumentomadre'],
  motherPhone: ['telefonomadre', 'celularmadre'],
  motherEmail: ['correomadre', 'emailmadre'],
  fatherName: ['nombrepadre', 'padre'],
  fatherDocumentType: ['tipodocpadre', 'tipodocumentopadre'],
  fatherDocumentNumber: ['numerodocpadre', 'numerodocumentopadre'],
  fatherPhone: ['telefonopadre', 'celularpadre'],
  fatherEmail: ['correopadre', 'emailpadre'],
};

function resolveAcademicDatabaseImportColumnIndexes(headerRow = []) {
  const normalizedHeaders = headerRow.map((cell) => normalizeHeaderKey(cell));
  const indexes = {};

  Object.entries(ACADEMIC_DATABASE_IMPORT_COLUMN_ALIASES).forEach(([fieldName, aliases]) => {
    const columnIndex = normalizedHeaders.findIndex((header) => aliases.includes(header));
    if (columnIndex >= 0) {
      indexes[fieldName] = columnIndex;
    }
  });

  return indexes;
}

function findAcademicDatabaseImportHeaderRow(matrix = []) {
  let bestRowIndex = -1;
  let bestScore = 0;

  for (let index = 0; index < Math.min(matrix.length, 10); index += 1) {
    const row = Array.isArray(matrix[index]) ? matrix[index] : [];
    const indexes = resolveAcademicDatabaseImportColumnIndexes(row);
    const score = Object.keys(indexes).length;
    if (score > bestScore) {
      bestScore = score;
      bestRowIndex = index;
    }
  }

  if (bestRowIndex < 0 || bestScore < 5) {
    throw new Error('No se pudo identificar la fila de encabezados de la plantilla de migracion.');
  }

  return bestRowIndex;
}

function readAcademicDatabaseImportFile(fileBuffer) {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
  const firstSheetName = workbook.SheetNames?.[0];
  if (!firstSheetName) {
    throw new Error('El archivo no tiene hojas para procesar.');
  }

  const sheet = workbook.Sheets[firstSheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
  if (!Array.isArray(matrix) || matrix.length === 0) {
    throw new Error('La hoja seleccionada no contiene datos.');
  }

  const headerRowIndex = findAcademicDatabaseImportHeaderRow(matrix);
  const headerRow = matrix[headerRowIndex] || [];
  const columnIndexes = resolveAcademicDatabaseImportColumnIndexes(headerRow);

  if (typeof columnIndexes.grade !== 'number' || typeof columnIndexes.lastName !== 'number' || typeof columnIndexes.firstName !== 'number') {
    throw new Error('La plantilla debe incluir al menos las columnas Grado, Apellidos y Nombres.');
  }

  const rows = [];
  for (let index = headerRowIndex + 1; index < matrix.length; index += 1) {
    const row = Array.isArray(matrix[index]) ? matrix[index] : [];
    const readValue = (fieldName) => {
      const columnIndex = columnIndexes[fieldName];
      return typeof columnIndex === 'number' ? row[columnIndex] : '';
    };

    const parsedRow = {
      rowNumber: index + 1,
      grade: normalizeText(readValue('grade')),
      lastName: normalizeText(readValue('lastName')),
      firstName: normalizeText(readValue('firstName')),
      gender: normalizeImportedGender(readValue('gender')),
      documentType: normalizeImportedDocumentType(readValue('studentDocumentType')),
      documentNumber: normalizeText(readValue('studentDocumentNumber')),
      birthDate: parseAcademicDatabaseDateCell(readValue('birthDate')),
      bloodType: normalizeText(readValue('bloodType')),
      birthPlace: normalizeText(readValue('birthPlace')),
      address: normalizeText(readValue('address')),
      mother: {
        name: normalizeText(readValue('motherName')),
        documentType: normalizeImportedDocumentType(readValue('motherDocumentType')),
        documentNumber: normalizeText(readValue('motherDocumentNumber')),
        phone: normalizeText(readValue('motherPhone')),
        email: normalizeEmail(readValue('motherEmail')),
        address: '',
      },
      father: {
        name: normalizeText(readValue('fatherName')),
        documentType: normalizeImportedDocumentType(readValue('fatherDocumentType')),
        documentNumber: normalizeText(readValue('fatherDocumentNumber')),
        phone: normalizeText(readValue('fatherPhone')),
        email: normalizeEmail(readValue('fatherEmail')),
        address: '',
      },
    };

    const hasValues = [
      parsedRow.grade,
      parsedRow.lastName,
      parsedRow.firstName,
      parsedRow.documentNumber,
      parsedRow.mother.name,
      parsedRow.father.name,
    ].some(Boolean);

    if (hasValues) {
      rows.push(parsedRow);
    }
  }

  return rows;
}

function buildParentImportCacheKey(parentData, relationship) {
  const email = normalizeEmail(parentData?.email);
  const documentNumber = normalizeText(parentData?.documentNumber);
  const phone = normalizeText(parentData?.phone);
  const name = normalizeText(parentData?.name).toLowerCase();

  if (email) return `${relationship}:email:${email}`;
  if (documentNumber) return `${relationship}:document:${documentNumber}`;
  if (name && phone) return `${relationship}:name-phone:${name}:${phone}`;
  if (name) return `${relationship}:name:${name}`;
  return '';
}

async function findExistingStudentForAcademicImport({ schoolId, studentData }) {
  const documentNumber = normalizeText(studentData?.documentNumber);
  if (documentNumber) {
    const byDocument = await Student.findOne({ schoolId, documentNumber, deletedAt: null });
    if (byDocument) {
      return { student: byDocument, ambiguous: false };
    }
  }

  const studentName = normalizeText(`${studentData?.firstName || ''} ${studentData?.lastName || ''}`);
  if (!studentName) {
    return { student: null, ambiguous: false };
  }

  const query = {
    schoolId,
    deletedAt: null,
    name: new RegExp(`^${escapeRegex(studentName)}$`, 'i'),
  };

  if (studentData?.birthDate instanceof Date && !Number.isNaN(studentData.birthDate.getTime())) {
    const start = new Date(studentData.birthDate);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    query.birthDate = { $gte: start, $lt: end };
  } else if (normalizeText(studentData?.grade)) {
    query.grade = normalizeText(studentData.grade);
  }

  const matches = await Student.find(query).limit(2);
  if (matches.length > 1) {
    return { student: null, ambiguous: true };
  }

  return { student: matches[0] || null, ambiguous: false };
}

function normalizeGradeFeeSettings(gradeSettings = []) {
  return (Array.isArray(gradeSettings) ? gradeSettings : [])
    .map((item) => ({
      grade: normalizeText(item?.grade),
      enrollmentFee: Math.max(0, Number(item?.enrollmentFee || 0)),
      monthlyTuition: Math.max(0, Number(item?.monthlyTuition || 0)),
      enrollmentBonus: Math.max(0, Number(item?.enrollmentBonus || 0)),
      dueDay: DEFAULT_ACADEMIC_MONTHLY_DUE_DAY,
      benefitRules: normalizeBenefitRules(item?.benefitRules || []),
    }))
    .filter((item) => item.grade);
}

function normalizeFeeAmount(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

function hasAnyFeeAmount(gradeSettings = []) {
  return (Array.isArray(gradeSettings) ? gradeSettings : []).some((setting) => (
    normalizeFeeAmount(setting?.enrollmentFee) > 0
    || normalizeFeeAmount(setting?.monthlyTuition) > 0
    || normalizeFeeAmount(setting?.enrollmentBonus) > 0
  ));
}

function buildBenefitRulesFromSchoolCreationPayload(payload = {}) {
  return normalizeBenefitRules((Array.isArray(payload.economicBenefits) ? payload.economicBenefits : [])
    .map((benefit) => ({
      label: normalizeText(benefit?.name),
      startDay: 1,
      endDay: Math.min(31, Math.max(1, Number.parseInt(benefit?.promptPaymentDayLimit || '10', 10) || 10)),
      discountPercent: normalizeFeeAmount(benefit?.value),
    })));
}

function buildGradeFeeSettingsFromSchoolCreationPayload(payload = {}, grades = []) {
  const costsByGrade = payload.financialCostsByGrade && typeof payload.financialCostsByGrade === 'object'
    ? payload.financialCostsByGrade
    : {};
  const gradeKeys = Array.from(new Set([
    ...(Array.isArray(grades) ? grades : []).map((grade) => normalizeText(grade)),
    ...Object.keys(costsByGrade).map((grade) => normalizeText(grade)),
  ].filter(Boolean)));
  const benefitRules = buildBenefitRulesFromSchoolCreationPayload(payload);

  return normalizeGradeFeeSettings(gradeKeys.map((grade) => {
    const costs = costsByGrade[grade] || {};
    return {
      grade,
      enrollmentFee: costs.enrollment ?? costs.enrollmentFee ?? costs.matricula,
      monthlyTuition: costs.tuition ?? costs.monthlyTuition ?? costs.pension,
      enrollmentBonus: costs.bond ?? costs.enrollmentBonus ?? costs.bono,
      benefitRules,
    };
  })).filter((setting) => (
    hasAnyFeeAmount([setting]) || normalizeBenefitRules(setting.benefitRules).length > 0
  ));
}

async function backfillEmptyFeeConfigurationFromSchoolCreationSnapshot(configuration, schoolId, grades = []) {
  if (!configuration || hasAnyFeeAmount(configuration.gradeSettings)) {
    return configuration;
  }

  const snapshot = await SchoolCreationSnapshot.findOne({ schoolId }).lean();
  const payload = snapshot?.payload || {};
  const snapshotGradeSettings = buildGradeFeeSettingsFromSchoolCreationPayload(payload, grades);
  const snapshotBenefitRules = buildBenefitRulesFromSchoolCreationPayload(payload);

  if (!hasAnyFeeAmount(snapshotGradeSettings) && snapshotBenefitRules.length === 0) {
    return configuration;
  }

  const existingByGrade = new Map((configuration.gradeSettings || [])
    .map((item) => item.toObject ? item.toObject() : item)
    .map((item) => [normalizeText(item.grade), item]));
  const snapshotByGrade = new Map(snapshotGradeSettings.map((item) => [normalizeText(item.grade), item]));
  const mergedGradeKeys = Array.from(new Set([
    ...(grades || []).map((grade) => normalizeText(grade)),
    ...existingByGrade.keys(),
    ...snapshotByGrade.keys(),
  ].filter(Boolean)));

  configuration.gradeSettings = normalizeGradeFeeSettings(mergedGradeKeys.map((grade) => {
    const existing = existingByGrade.get(grade) || {};
    const fromSnapshot = snapshotByGrade.get(grade) || {};
    const existingBenefitRules = normalizeBenefitRules(existing.benefitRules || []);
    return {
      ...existing,
      grade,
      enrollmentFee: normalizeFeeAmount(existing.enrollmentFee) || normalizeFeeAmount(fromSnapshot.enrollmentFee),
      monthlyTuition: normalizeFeeAmount(existing.monthlyTuition) || normalizeFeeAmount(fromSnapshot.monthlyTuition),
      enrollmentBonus: normalizeFeeAmount(existing.enrollmentBonus) || normalizeFeeAmount(fromSnapshot.enrollmentBonus),
      benefitRules: existingBenefitRules.length > 0 ? existingBenefitRules : normalizeBenefitRules(fromSnapshot.benefitRules || []),
    };
  }));

  if (normalizeBenefitRules(configuration.benefitRules || []).length === 0 && snapshotBenefitRules.length > 0) {
    configuration.benefitRules = snapshotBenefitRules;
  }

  await configuration.save();
  return configuration;
}

function resolveAcademicFeeBenefitRules(configuration, gradeFeeSetting = null) {
  const globalBenefitRules = normalizeBenefitRules(configuration?.benefitRules || []);
  if (globalBenefitRules.length > 0) {
    return globalBenefitRules;
  }

  return normalizeBenefitRules(gradeFeeSetting?.benefitRules || []);
}

async function ensureAcademicFeeConfiguration(schoolId, grades = []) {
  let configuration = await AcademicFeeConfiguration.findOne({ schoolId });
  if (!configuration) {
    configuration = await AcademicFeeConfiguration.create({
      schoolId,
      academicYear: getCurrentAcademicYear(),
      schoolYearStartDate: new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1)),
      schoolYearEndDate: new Date(Date.UTC(new Date().getUTCFullYear(), 11, 31)),
      lateEnrollmentSurchargeType: 'none',
      lateEnrollmentSurchargeValue: 0,
      benefitRules: [],
      enrollmentBenefitRules: [],
      gradeSettings: normalizeGradeFeeSettings(grades.map((grade) => ({ grade }))),
    });
  }

  const knownGrades = new Set((configuration.gradeSettings || []).map((item) => normalizeText(item.grade)).filter(Boolean));
  const missingGrades = Array.from(new Set((grades || []).map((grade) => normalizeText(grade)).filter(Boolean))).filter((grade) => !knownGrades.has(grade));

  if (missingGrades.length) {
    configuration.gradeSettings = normalizeGradeFeeSettings([
      ...(configuration.gradeSettings || []).map((item) => item.toObject ? item.toObject() : item),
      ...missingGrades.map((grade) => ({ grade })),
    ]);
    await configuration.save();
  }

  configuration = await backfillEmptyFeeConfigurationFromSchoolCreationSnapshot(configuration, schoolId, grades);

  if (normalizeBenefitRules(configuration?.benefitRules || []).length === 0) {
    const legacyBenefitSource = (configuration.gradeSettings || []).find((item) => normalizeBenefitRules(item?.benefitRules || []).length > 0) || null;
    const legacyBenefitRules = normalizeBenefitRules(legacyBenefitSource?.benefitRules || []);
    if (legacyBenefitRules.length > 0) {
      configuration.benefitRules = legacyBenefitRules;
      await configuration.save();
    }
  }

  return configuration;
}

function getApplicableBenefitRule(benefitRules = [], referenceDate = new Date()) {
  const currentDay = new Date(referenceDate).getUTCDate();
  return (benefitRules || []).find((rule) => currentDay >= Number(rule.startDay || 0) && currentDay <= Number(rule.endDay || 0)) || null;
}

function getAcademicPaymentPlanBenefitDueDay(billingProfile = {}) {
  const benefitRules = normalizeBenefitRules(billingProfile?.benefitRules || []);
  const grade = billingProfile?.grade || '';
  const benefitRule = benefitRules.find((rule) => (
    Number(rule.discountPercent || 0) > 0
    || (normalizeText(rule.discountType) === 'fixed' && getFixedBenefitAmountForGrade(rule, grade) > 0)
  ));

  return benefitRule ? Number(benefitRule.endDay || DEFAULT_ACADEMIC_MONTHLY_DUE_DAY) : Number(billingProfile?.dueDay || DEFAULT_ACADEMIC_MONTHLY_DUE_DAY);
}

function buildAcademicFullMonthlyPricing(monthlyBaseAmount) {
  const baseAmount = Math.max(0, Number(monthlyBaseAmount || 0));
  return {
    baseAmount,
    effectiveAmount: baseAmount,
    discountPercent: 0,
    fixedDiscountAmount: 0,
    benefitLabel: '',
    benefitWindowLabel: '',
  };
}

function buildAcademicMonthlyPricingAfterBenefitDueDate(monthlyBaseAmount, billingProfile = {}) {
  const baseAmount = Math.max(0, Number(monthlyBaseAmount || 0));
  const effectiveAmount = applyMonthlyTuitionAdditionalDiscount(baseAmount, billingProfile);
  const additionalDiscount = normalizeAdditionalPensionDiscount(billingProfile);

  return {
    baseAmount,
    effectiveAmount,
    discountPercent: additionalDiscount.type === 'percent' ? additionalDiscount.percent : 0,
    fixedDiscountAmount: additionalDiscount.type === 'fixed' ? Math.min(baseAmount, additionalDiscount.fixedAmount) : 0,
    benefitLabel: hasMonthlyTuitionAdditionalDiscount(billingProfile)
      ? additionalDiscount.label || 'Descuento individual'
      : '',
    benefitWindowLabel: '',
  };
}

function resolveAcademicAnnualTuitionDiscountConfig(billingProfile = {}) {
  const discountPercent = normalizeAcademicAdditionalDiscountPercent(billingProfile?.annualTuitionAdditionalDiscountPercent || 0);

  return {
    discountPercent,
    fixedDiscountAmount: 0,
    benefitLabel: discountPercent > 0 ? normalizeText(billingProfile?.annualTuitionAdditionalDiscountLabel) || 'Descuento individual en matrícula' : '',
    benefitWindowLabel: '',
  };
}

function resolveAcademicAnnualTuitionPricing({
  charge = null,
  billingProfile = {},
  feeConfiguration = {},
  referenceDate = new Date(),
} = {}) {
  const grade = normalizeText(billingProfile?.grade || '');
  const gradeFeeSetting = findGradeFeeSetting(feeConfiguration, grade);
  const schoolYearConfiguration = normalizeAcademicSchoolYearConfiguration(feeConfiguration || {}, grade);
  const annualBaseAmount = Math.max(
    0,
    Number(
      charge?.originalAmount
      || billingProfile?.annualTuitionBaseAmount
      || gradeFeeSetting?.enrollmentFee
      || charge?.amount
      || billingProfile?.annualTuitionAmount
      || 0
    )
  );
  const annualDiscountConfig = resolveAcademicAnnualTuitionDiscountConfig(billingProfile);
  const activeAnnualBenefitRule = getApplicableEnrollmentBenefitRule(
    schoolYearConfiguration.enrollmentBenefitRules,
    referenceDate,
    grade
  );
  const activeAnnualBenefitDiscountAmount = resolveAcademicEnrollmentBenefitDiscountAmount(
    annualBaseAmount,
    activeAnnualBenefitRule,
    grade
  );
  const amountAfterActiveAnnualBenefit = Math.max(0, annualBaseAmount - activeAnnualBenefitDiscountAmount);
  const activeAnnualAdditionalDiscountAmount = Number(annualDiscountConfig.discountPercent || 0) > 0
    ? Math.min(amountAfterActiveAnnualBenefit, Math.round(amountAfterActiveAnnualBenefit * (Number(annualDiscountConfig.discountPercent || 0) / 100)))
    : Math.min(amountAfterActiveAnnualBenefit, Math.max(0, Number(billingProfile?.annualTuitionAdditionalDiscountAmount || 0)));
  let effectiveAmount = Math.max(0, amountAfterActiveAnnualBenefit - activeAnnualAdditionalDiscountAmount);
  const profileEffectiveAmount = Math.max(0, Number(billingProfile?.annualTuitionAmount || 0));
  const storedBenefitDiscount = Math.max(0, Number(billingProfile?.annualTuitionDiscountAmount || 0));
  const storedAdditionalDiscount = Math.max(0, Number(billingProfile?.annualTuitionAdditionalDiscountAmount || 0));
  const profileDerivedAmount = profileEffectiveAmount > 0
    ? profileEffectiveAmount
    : Math.max(0, annualBaseAmount - storedBenefitDiscount - storedAdditionalDiscount);

  if (profileDerivedAmount > 0 && profileDerivedAmount < annualBaseAmount && profileDerivedAmount < effectiveAmount) {
    effectiveAmount = profileDerivedAmount;
  }

  const resolvedBenefitDiscountAmount = activeAnnualBenefitDiscountAmount > 0
    ? activeAnnualBenefitDiscountAmount
    : Math.max(0, annualBaseAmount - effectiveAmount - Math.max(0, activeAnnualAdditionalDiscountAmount));
  const resolvedAdditionalDiscountAmount = activeAnnualAdditionalDiscountAmount > 0
    ? activeAnnualAdditionalDiscountAmount
    : Math.max(0, storedAdditionalDiscount);
  const annualBenefitLabel = [
    normalizeText(activeAnnualBenefitRule?.label),
    normalizeText(annualDiscountConfig.benefitLabel),
  ].filter(Boolean).join(' + ');

  return {
    baseAmount: annualBaseAmount,
    effectiveAmount,
    discountPercent: annualDiscountConfig.discountPercent || 0,
    fixedDiscountAmount: Math.max(0, annualBaseAmount - effectiveAmount),
    benefitLabel: annualBenefitLabel || normalizeText(billingProfile?.annualTuitionBenefitLabel) || normalizeText(billingProfile?.annualTuitionAdditionalDiscountLabel),
    benefitWindowLabel: activeAnnualBenefitRule?.endDate ? getAcademicBenefitWindowLabel(activeAnnualBenefitRule) : '',
    category: 'annual_tuition',
    activeAnnualBenefitDiscountAmount: resolvedBenefitDiscountAmount,
    activeAnnualAdditionalDiscountAmount: resolvedAdditionalDiscountAmount,
  };
}

function addAcademicMonthsUtc(date, monthCount = 0) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + Number(monthCount || 0), 1));
}

function buildAcademicDueDateForMonth(monthDate, dueDay = DEFAULT_ACADEMIC_MONTHLY_DUE_DAY) {
  return new Date(Date.UTC(
    monthDate.getUTCFullYear(),
    monthDate.getUTCMonth(),
    Math.min(28, Math.max(1, Math.round(Number(dueDay || DEFAULT_ACADEMIC_MONTHLY_DUE_DAY))))
  ));
}

function formatAcademicMonthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function formatAcademicMonthLabel(date) {
  return new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function getAcademicBenefitWindowLabel(rule = null) {
  if (!rule) {
    return '';
  }

  return `Aplica del ${Number(rule.startDay || 1)} al ${Number(rule.endDay || 31)} de cada mes`;
}

function getFixedBenefitAmountForGrade(rule = {}, grade = '') {
  const amountsByGrade = normalizeBenefitFixedAmountsByGrade(rule.fixedAmountsByGrade || {});
  const aliases = getFeeGradeAliases(grade);
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(amountsByGrade, alias)) {
      return Math.max(0, Number(amountsByGrade[alias] || 0));
    }
  }

  return 0;
}

function resolveAcademicChargeAmounts(charge, billingProfile, referenceDate = new Date(), feeConfiguration = null) {
  const baseAmount = Math.max(0, Number(charge?.originalAmount || charge?.amount || 0));
  if (charge?.category === 'monthly_statement') {
    const effectiveAmount = Math.max(0, Number(charge?.amount || baseAmount || 0));
    return {
      baseAmount,
      effectiveAmount,
      discountPercent: 0,
      fixedDiscountAmount: Math.max(0, baseAmount - effectiveAmount),
      benefitLabel: '',
      benefitWindowLabel: '',
      category: charge?.category || '',
    };
  }
  if (charge?.category === 'annual_tuition') {
    return resolveAcademicAnnualTuitionPricing({
      charge,
      billingProfile,
      feeConfiguration: feeConfiguration || {},
      referenceDate,
    });
  }

  const discountConfig = charge?.category === 'monthly_tuition'
    ? resolveAcademicMonthlyDiscountConfig(billingProfile, referenceDate)
    : { discountPercent: 0, fixedDiscountAmount: 0, benefitLabel: '', additionalDiscount: normalizeAdditionalPensionDiscount() };
  const discountPercent = discountConfig.discountPercent;
  const fixedDiscountAmount = Math.min(baseAmount, Math.max(0, Number(discountConfig.fixedDiscountAmount || 0)));
  const amountAfterFixedDiscount = Math.max(0, baseAmount - fixedDiscountAmount);
  const amountAfterRectoriaPercent = discountPercent > 0 || fixedDiscountAmount > 0
    ? Math.max(0, Math.round(amountAfterFixedDiscount * (1 - (discountPercent / 100))))
    : baseAmount;
  const effectiveAmount = charge?.category === 'monthly_tuition'
    ? applyMonthlyTuitionAdditionalDiscount(amountAfterRectoriaPercent, billingProfile)
    : amountAfterRectoriaPercent;
  const benefitLabels = [
    discountConfig.benefitLabel,
    hasMonthlyTuitionAdditionalDiscount(billingProfile) ? normalizeAdditionalPensionDiscount(billingProfile).label : '',
  ].filter(Boolean);

  return {
    baseAmount,
    effectiveAmount,
    discountPercent,
    fixedDiscountAmount,
    benefitLabel: benefitLabels.join(' + '),
    benefitWindowLabel: discountConfig.benefitWindowLabel || '',
    category: charge?.category || '',
  };
}

function formatAcademicDiscountDescription(pricing = {}) {
  const parts = [];
  if (Number(pricing.fixedDiscountAmount || 0) > 0) {
    parts.push(`${formatCurrency(pricing.fixedDiscountAmount)} de descuento fijo`);
  }
  if (Number(pricing.discountPercent || 0) > 0) {
    parts.push(`${pricing.discountPercent}% off`);
  }

  const targetLabel = pricing.category === 'annual_tuition' ? 'matrícula' : 'pensión';
  return parts.length ? `${pricing.benefitLabel || 'Beneficio'} · ${parts.join(' + ')} sobre ${targetLabel}.` : '';
}

function buildAcademicPaymentPlanBenefitDescription(pricing = {}) {
  const discountDescription = formatAcademicDiscountDescription(pricing);
  const windowLabel = normalizeText(pricing.benefitWindowLabel);
  if (discountDescription && windowLabel) {
    return `${discountDescription} ${windowLabel}.`;
  }

  if (discountDescription) {
    return discountDescription;
  }

  return windowLabel || 'Sin beneficio económico activo para la fecha actual.';
}

function buildAcademicStudentPaymentPlan({ student, billingProfile, feeConfiguration, relatedCharges = [], paymentsByChargeId = new Map(), now = new Date() }) {
  const studentGrade = normalizeText(billingProfile?.grade || student?.grade || student?.course || '');
  const gradeFeeSetting = findGradeFeeSetting(feeConfiguration, studentGrade);
  const fallbackBenefitRules = resolveAcademicFeeBenefitRules(feeConfiguration, gradeFeeSetting);
  const configuredAnnualTuitionAmount = Number(gradeFeeSetting?.enrollmentFee || 0);
  const profileAnnualTuitionAmount = Number(billingProfile?.annualTuitionAmount || 0);
  const profileAnnualTuitionBaseAmount = Number(billingProfile?.annualTuitionBaseAmount || 0);
  const annualTuitionBaseAmount = profileAnnualTuitionBaseAmount || configuredAnnualTuitionAmount;
  const annualTuitionDiscountAmount = Number(billingProfile?.annualTuitionDiscountAmount || 0);
  const annualTuitionAdditionalDiscountAmount = Number(billingProfile?.annualTuitionAdditionalDiscountAmount || 0);
  const derivedAnnualTuitionAmount = Math.max(0, annualTuitionBaseAmount - annualTuitionDiscountAmount - annualTuitionAdditionalDiscountAmount);
  const effectiveBillingProfile = {
    ...(billingProfile || {}),
    grade: billingProfile?.grade || student?.grade || gradeFeeSetting?.grade || '',
    academicYear: billingProfile?.academicYear || feeConfiguration?.academicYear || '',
    entryDate: billingProfile?.entryDate || feeConfiguration?.schoolYearStartDate || null,
    monthlyTuitionAmount: Number(billingProfile?.monthlyTuitionAmount || 0) || Number(gradeFeeSetting?.monthlyTuition || 0),
    monthlyTuitionAdditionalDiscountType: billingProfile?.monthlyTuitionAdditionalDiscountType || 'percent',
    monthlyTuitionAdditionalDiscountPercent: Number(billingProfile?.monthlyTuitionAdditionalDiscountPercent || 0),
    monthlyTuitionAdditionalDiscountFixedAmount: Number(billingProfile?.monthlyTuitionAdditionalDiscountFixedAmount || 0),
    monthlyTuitionAdditionalDiscountLabel: billingProfile?.monthlyTuitionAdditionalDiscountLabel || '',
    annualTuitionAmount: profileAnnualTuitionAmount > 0 ? profileAnnualTuitionAmount : derivedAnnualTuitionAmount,
    annualTuitionInstallments: normalizeAcademicInstallmentCount(billingProfile?.annualTuitionInstallments, 1),
    annualTuitionDueDate: billingProfile?.annualTuitionDueDate || null,
    annualTuitionBaseAmount,
    annualTuitionDiscountAmount,
    annualTuitionBenefitLabel: billingProfile?.annualTuitionBenefitLabel || '',
    annualTuitionAdditionalDiscountPercent: Number(billingProfile?.annualTuitionAdditionalDiscountPercent || 0),
    annualTuitionAdditionalDiscountAmount,
    annualTuitionAdditionalDiscountLabel: billingProfile?.annualTuitionAdditionalDiscountLabel || '',
    dueDay: Number(billingProfile?.dueDay || 0) || Number(gradeFeeSetting?.dueDay || DEFAULT_ACADEMIC_MONTHLY_DUE_DAY),
    benefitRules: Array.isArray(billingProfile?.benefitRules) && billingProfile.benefitRules.length
      ? billingProfile.benefitRules
      : fallbackBenefitRules,
  };

  const schoolYearConfiguration = normalizeAcademicSchoolYearConfiguration(feeConfiguration || {}, effectiveBillingProfile.grade);
  const parsedEntryDate = parseAcademicCalendarDate(effectiveBillingProfile.entryDate) || schoolYearConfiguration.startDate;
  const schoolYearStartMonth = startOfAcademicMonthUtc(schoolYearConfiguration.startDate);
  const schoolYearEndMonth = startOfAcademicMonthUtc(schoolYearConfiguration.endDate);
  const entryMonth = startOfAcademicMonthUtc(parsedEntryDate);
  const scheduleStartMonth = entryMonth.getTime() > schoolYearStartMonth.getTime() ? entryMonth : schoolYearStartMonth;

  const buildPaymentDetails = (chargePayments = []) => chargePayments.map((payment) => ({
    _id: payment._id,
    amount: Number(payment.amount || 0),
    method: payment.method || '',
    methodLabel: labelAcademicPaymentMethod(payment.method),
    notes: payment.notes || '',
    paidAt: payment.paidAt || payment.createdAt || null,
    recordedByRole: payment.recordedByRole || '',
  }));

  const annualTuitionCharges = relatedCharges
    .filter((charge) => String(charge.category || '') === 'annual_tuition')
    .sort((left, right) => new Date(left.dueDate || 0) - new Date(right.dueDate || 0));
  const annualTuitionRows = annualTuitionCharges.map((charge, index) => {
    const chargePayments = charge?._id ? paymentsByChargeId.get(String(charge._id)) || [] : [];
    const latestPayment = chargePayments[0] || null;
    const rawPaidAmount = chargePayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0) || Number(charge?.paidAmount || 0);
    const dueDate = parseAcademicCalendarDate(charge.dueDate) || parsedEntryDate;
    const paidReferenceDate = latestPayment?.paidAt || charge?.paidAt || dueDate;
    const chargeIsPaid = String(charge?.status || '') === 'paid';
    const pricing = resolveAcademicChargeAmounts(
      charge,
      effectiveBillingProfile,
      chargeIsPaid ? paidReferenceDate : now,
      feeConfiguration
    );
    const effectiveAmount = chargeIsPaid
      ? Number(rawPaidAmount || charge?.chargeAmount || charge?.amount || pricing.effectiveAmount || 0)
      : Number(pricing.effectiveAmount || charge?.chargeAmount || charge?.amount || 0);
    const paidAmount = chargeIsPaid
      ? Number(rawPaidAmount || effectiveAmount || 0)
      : Math.min(effectiveAmount, rawPaidAmount || 0);
    const outstandingAmount = chargeIsPaid ? 0 : Math.max(0, effectiveAmount - paidAmount);
    const isPaid = chargeIsPaid || (outstandingAmount <= 0 && paidAmount > 0);
    const isOverdue = !isPaid && dueDate.getTime() < now.getTime();
    const paymentMethod = latestPayment?.method || charge?.paymentMethod || '';

    return {
      key: `annual_tuition-${charge._id || index}`,
      monthKey: '',
      monthLabel: annualTuitionCharges.length > 1 ? `Matrícula · cuota ${index + 1}/${annualTuitionCharges.length}` : 'Matrícula',
      category: 'annual_tuition',
      paymentConceptLabel: annualTuitionCharges.length > 1 ? 'Matrícula financiada' : 'Matrícula',
      concept: charge?.concept || 'Matrícula anual',
      dueDate,
      status: isPaid ? 'paid' : (isOverdue ? 'overdue' : 'upcoming'),
      statusLabel: isPaid ? 'Pagado' : (isOverdue ? 'En mora' : 'Pendiente'),
      baseAmount: pricing.baseAmount,
      amount: isPaid ? effectiveAmount : outstandingAmount,
      chargeAmount: effectiveAmount,
      paidAmount,
      outstandingAmount,
      benefitLabel: pricing.benefitLabel || effectiveBillingProfile.annualTuitionBenefitLabel || '',
      benefitWindowLabel: pricing.benefitWindowLabel || '',
      benefitDescription: (() => {
        const parts = [];
        if (Number(pricing.activeAnnualBenefitDiscountAmount || 0) > 0) {
          parts.push(`${formatCurrency(pricing.activeAnnualBenefitDiscountAmount)} de beneficio de matrícula`);
        }
        if (Number(pricing.activeAnnualAdditionalDiscountAmount || 0) > 0) {
          parts.push(`${formatCurrency(pricing.activeAnnualAdditionalDiscountAmount)} de descuento adicional`);
        }
        if (parts.length) {
          return `${parts.join(' + ')}.`;
        }
        return charge?.description || buildAcademicPaymentPlanBenefitDescription(pricing);
      })(),
      paymentMethod,
      paymentMethodLabel: isPaid ? labelAcademicPaymentMethod(paymentMethod) : '',
      paidAt: isPaid ? paidReferenceDate : null,
      paymentNotes: isPaid ? latestPayment?.notes || '' : '',
      paymentDetails: isPaid ? buildPaymentDetails(chargePayments) : [],
      existingChargeId: charge?._id || '',
    };
  });

  if (!annualTuitionRows.length && (Number(effectiveBillingProfile.annualTuitionBaseAmount || 0) > 0 || Number(effectiveBillingProfile.annualTuitionAmount || 0) > 0)) {
    const annualPricing = resolveAcademicAnnualTuitionPricing({
      billingProfile: effectiveBillingProfile,
      feeConfiguration,
      referenceDate: now,
    });
    const annualBaseAmount = annualPricing.baseAmount;
    const annualTuitionDueDate = resolveAcademicAnnualTuitionFirstDueDate({
      feeConfiguration,
      grade: effectiveBillingProfile.grade,
      fallbackDate: parsedEntryDate,
      referenceDate: now,
      billingProfile: effectiveBillingProfile,
    });
    const activeAnnualBenefitDiscountAmount = annualPricing.activeAnnualBenefitDiscountAmount;
    const activeAnnualAdditionalDiscountAmount = annualPricing.activeAnnualAdditionalDiscountAmount;
    const annualAmount = annualPricing.effectiveAmount;
    const annualBenefitLabel = annualPricing.benefitLabel;
    const annualInstallmentCount = normalizeAcademicInstallmentCount(effectiveBillingProfile.annualTuitionInstallments, 1);
    const annualInstallmentAmounts = annualAmount > 0 ? splitAcademicAmountIntoInstallments(annualAmount, annualInstallmentCount) : [0];
    const annualBaseInstallmentAmounts = annualBaseAmount > 0 ? splitAcademicAmountIntoInstallments(annualBaseAmount, annualInstallmentCount) : annualInstallmentAmounts;
    const annualBenefitParts = [];
    if (activeAnnualBenefitDiscountAmount > 0) {
      annualBenefitParts.push(`${formatCurrency(activeAnnualBenefitDiscountAmount)} de beneficio de matrícula`);
    }
    if (activeAnnualAdditionalDiscountAmount > 0) {
      annualBenefitParts.push(`${formatCurrency(activeAnnualAdditionalDiscountAmount)} de descuento adicional`);
    }

    annualInstallmentAmounts.forEach((installmentAmount, index) => {
      const installmentDueDate = buildAcademicAnnualTuitionInstallmentDueDate(annualTuitionDueDate, index);
      const isFinanced = annualInstallmentAmounts.length > 1;
      annualTuitionRows.push({
        key: `annual_tuition-profile-${index + 1}`,
        monthKey: '',
        monthLabel: isFinanced ? `Matrícula · cuota ${index + 1}/${annualInstallmentAmounts.length}` : 'Matrícula',
        category: 'annual_tuition',
        paymentConceptLabel: isFinanced ? 'Matrícula financiada' : 'Matrícula',
        concept: isFinanced ? `Matrícula anual ${new Date(parsedEntryDate || now).getUTCFullYear()} · cuota ${index + 1}/${annualInstallmentAmounts.length}` : `Matrícula anual ${new Date(parsedEntryDate || now).getUTCFullYear()}`,
        dueDate: installmentDueDate,
        status: installmentDueDate.getTime() < now.getTime() ? 'overdue' : 'upcoming',
        statusLabel: installmentDueDate.getTime() < now.getTime() ? 'En mora' : 'Pendiente',
        baseAmount: annualBaseInstallmentAmounts[index] || installmentAmount,
        amount: installmentAmount,
        chargeAmount: installmentAmount,
        paidAmount: 0,
        outstandingAmount: installmentAmount,
        benefitLabel: annualBenefitLabel,
        benefitWindowLabel: '',
        benefitDescription: annualBenefitParts.length ? `${annualBenefitParts.join(' + ')}.` : 'Sin beneficio económico activo para matrícula.',
        paymentMethod: '',
        paymentMethodLabel: '',
        paidAt: null,
        paymentNotes: '',
        paymentDetails: [],
        existingChargeId: '',
      });
    });
  }

  if (scheduleStartMonth.getTime() > schoolYearEndMonth.getTime()) {
    return {
      academicYear: effectiveBillingProfile.academicYear || feeConfiguration?.academicYear || '',
      schoolYearStartDate: schoolYearConfiguration.startDate,
      schoolYearEndDate: schoolYearConfiguration.endDate,
      rows: annualTuitionRows,
    };
  }

  if (Number(effectiveBillingProfile.monthlyTuitionAmount || 0) <= 0) {
    return {
      academicYear: effectiveBillingProfile.academicYear || feeConfiguration?.academicYear || '',
      schoolYearStartDate: schoolYearConfiguration.startDate,
      schoolYearEndDate: schoolYearConfiguration.endDate,
      rows: annualTuitionRows,
    };
  }

  const monthlyChargesByMonthKey = new Map();
  relatedCharges
    .filter((charge) => String(charge.category || '') === 'monthly_tuition')
    .forEach((charge) => {
      const chargeDueDate = parseAcademicCalendarDate(charge.dueDate);
      const monthKey = normalizeText(charge.monthKey) || (chargeDueDate ? formatAcademicMonthKey(chargeDueDate) : '');
      if (!monthKey) return;
      const existing = monthlyChargesByMonthKey.get(monthKey);
      if (!existing || Number(charge.paidAmount || 0) > Number(existing.paidAmount || 0)) {
        monthlyChargesByMonthKey.set(monthKey, charge);
      }
    });

  const totalMonths = Math.max(1, getAcademicMonthDiff(scheduleStartMonth, schoolYearEndMonth) + 1);
  const monthlyBaseAmount = Math.max(0, Number(effectiveBillingProfile.monthlyTuitionAmount || 0));
  const benefitDueDay = getAcademicPaymentPlanBenefitDueDay(effectiveBillingProfile);
  return {
    academicYear: effectiveBillingProfile.academicYear || feeConfiguration?.academicYear || '',
    schoolYearStartDate: schoolYearConfiguration.startDate,
    schoolYearEndDate: schoolYearConfiguration.endDate,
    rows: annualTuitionRows.concat(Array.from({ length: totalMonths }, (_, index) => {
      const monthDate = addAcademicMonthsUtc(scheduleStartMonth, index);
      const monthKey = formatAcademicMonthKey(monthDate);
      const dueDate = buildAcademicDueDateForMonth(monthDate, benefitDueDay);
      const existingCharge = monthlyChargesByMonthKey.get(monthKey) || null;
      const chargePayments = existingCharge?._id ? paymentsByChargeId.get(String(existingCharge._id)) || [] : [];
      const latestPayment = chargePayments[0] || null;
      const rawPaidAmount = chargePayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0) || Number(existingCharge?.paidAmount || 0);
      const paidReferenceDate = latestPayment?.paidAt || existingCharge?.paidAt || dueDate;
      const chargeIsPaid = String(existingCharge?.status || '') === 'paid';
      const benefitDueDateHasExpired = dueDate.getTime() < now.getTime();
      const pricing = !chargeIsPaid && benefitDueDateHasExpired
        ? buildAcademicMonthlyPricingAfterBenefitDueDate(monthlyBaseAmount, effectiveBillingProfile)
        : resolveAcademicChargeAmounts({ category: 'monthly_tuition', amount: monthlyBaseAmount, originalAmount: monthlyBaseAmount }, effectiveBillingProfile, chargeIsPaid ? paidReferenceDate : dueDate);
      const effectiveAmount = chargeIsPaid
        ? Number(rawPaidAmount || existingCharge?.chargeAmount || existingCharge?.amount || pricing.effectiveAmount || 0)
        : Number(pricing.effectiveAmount || 0);
      const paidAmount = chargeIsPaid
        ? Number(rawPaidAmount || effectiveAmount || 0)
        : Math.min(effectiveAmount, rawPaidAmount || 0);
      const outstandingAmount = chargeIsPaid ? 0 : Math.max(0, effectiveAmount - paidAmount);
      const isPaid = chargeIsPaid || (outstandingAmount <= 0 && paidAmount > 0);
      const isOverdue = !isPaid && dueDate.getTime() < now.getTime();
      const isUpcoming = !isPaid && dueDate.getTime() >= now.getTime();
      const paymentMethod = latestPayment?.method || existingCharge?.paymentMethod || '';

      return {
        key: monthKey,
        monthKey,
        monthLabel: formatAcademicMonthLabel(monthDate),
        category: 'monthly_tuition',
        paymentConceptLabel: 'Pensión',
        concept: existingCharge?.concept || `Pensión ${formatAcademicMonthLabel(monthDate)}`,
        dueDate,
        status: isPaid ? 'paid' : (isOverdue ? 'overdue' : (isUpcoming ? 'upcoming' : 'pending')),
        statusLabel: isPaid ? 'Pagado' : (isOverdue ? 'En mora' : 'Pendiente'),
        baseAmount: monthlyBaseAmount,
        amount: isPaid ? effectiveAmount : outstandingAmount,
        chargeAmount: effectiveAmount,
        paidAmount,
        outstandingAmount,
        benefitLabel: pricing.benefitLabel || '',
        benefitWindowLabel: pricing.benefitWindowLabel || '',
        benefitDescription: buildAcademicPaymentPlanBenefitDescription(pricing),
        paymentMethod,
        paymentMethodLabel: isPaid ? labelAcademicPaymentMethod(paymentMethod) : '',
        paidAt: isPaid ? paidReferenceDate : null,
        paymentNotes: isPaid ? latestPayment?.notes || '' : '',
        paymentDetails: isPaid ? buildPaymentDetails(chargePayments) : [],
        existingChargeId: existingCharge?._id || '',
      };
    })),
  };
}

function calculateAge(birthDateValue) {
  if (!birthDateValue) {
    return null;
  }

  const birthDate = new Date(birthDateValue);
  if (Number.isNaN(birthDate.getTime())) {
    return null;
  }

  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) {
    age -= 1;
  }
  return Math.max(0, age);
}

function normalizeAcademicDatabaseGender(value) {
  return normalizeImportedGender(value);
}

function normalizeAcademicDatabaseDocumentType(value) {
  return normalizeImportedDocumentType(value);
}

function parseAcademicDatabaseEditDate(value) {
  const text = normalizeText(value);
  if (!text) {
    return null;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return 'invalid';
  }

  return parsed;
}

function getPromotedGradeValue(rawGrade) {
  const grade = normalizeText(rawGrade);
  if (!grade) {
    return '';
  }

  const normalized = grade
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const preschoolMap = {
    prejardin: 'Jardin',
    prejardín: 'Jardin',
    jardin: 'Transicion',
    jardín: 'Transicion',
    transicion: '1',
    transición: '1',
  };

  if (preschoolMap[normalized]) {
    return preschoolMap[normalized];
  }

  const numericMatch = grade.match(/^(\d{1,2})(.*)$/);
  if (!numericMatch) {
    return '';
  }

  const nextNumeric = Number(numericMatch[1]);
  if (!Number.isFinite(nextNumeric) || nextNumeric >= 11) {
    return '';
  }

  return `${nextNumeric + 1}${numericMatch[2] || ''}`.trim();
}

function buildAcademicGradePromotionPreview(students = []) {
  const previewMap = new Map();
  let promotableStudents = 0;

  students.forEach((student) => {
    const fromGrade = normalizeText(student?.grade);
    const toGrade = getPromotedGradeValue(fromGrade);
    if (!fromGrade || !toGrade) {
      return;
    }

    promotableStudents += 1;
    const key = `${fromGrade}=>${toGrade}`;
    const current = previewMap.get(key) || { fromGrade, toGrade, count: 0 };
    current.count += 1;
    previewMap.set(key, current);
  });

  const preview = Array.from(previewMap.values()).sort((left, right) => left.fromGrade.localeCompare(right.fromGrade, 'es'));

  return {
    totalStudents: students.length,
    promotableStudents,
    skippedStudents: Math.max(0, students.length - promotableStudents),
    preview,
  };
}

async function buildAcademicDatabaseSummary(schoolId) {
  const [students, links, parents, billingProfiles] = await Promise.all([
    Student.find({ schoolId, deletedAt: null }).sort({ grade: 1, lastName: 1, firstName: 1, name: 1 }).lean(),
    ParentStudentLink.find({ schoolId, status: 'active' }).lean(),
    User.find({ schoolId, role: 'parent', deletedAt: null }).select('name email phone documentType documentNumber').lean(),
    StudentBillingProfile.find({ schoolId }).select('studentId entryDate enrollmentBonusInstallments annualTuitionInstallments initialEnrollmentAndFirstTuitionPaid annualTuitionAdditionalDiscountPercent annualTuitionAdditionalDiscountLabel monthlyTuitionAdditionalDiscountPercent monthlyTuitionAdditionalDiscountLabel').lean(),
  ]);

  const parentMap = new Map(parents.map((parent) => [String(parent._id), parent]));
  const billingProfileMap = new Map(billingProfiles.map((profile) => [String(profile.studentId), profile]));
  const relationMap = new Map();
  for (const link of links) {
    const studentKey = String(link.studentId);
    if (!relationMap.has(studentKey)) {
      relationMap.set(studentKey, { mother: null, father: null, acudiente: [] });
    }
    const bucket = relationMap.get(studentKey);
    const relation = normalizeText(link.relationship).toLowerCase();
    const parent = parentMap.get(String(link.parentId)) || null;
    if (!parent) {
      continue;
    }
    if (relation === 'mother' || relation === 'madre') {
      bucket.mother = parent;
    } else if (relation === 'father' || relation === 'padre') {
      bucket.father = parent;
    } else {
      bucket.acudiente.push(parent);
    }
  }

  return students.map((student) => {
    const relations = relationMap.get(String(student._id)) || { mother: null, father: null, acudiente: [] };
    const billingProfile = billingProfileMap.get(String(student._id)) || null;
    const mother = relations.mother || relations.acudiente[0] || null;
    const father = relations.father || relations.acudiente[1] || null;
    return {
      _id: student._id,
      grade: student.grade || '',
      course: student.course || '',
      schoolCode: student.schoolCode || '',
      lastName: student.lastName || '',
      firstName: student.firstName || student.name || '',
      gender: student.gender || '',
      documentType: student.documentType || '',
      documentNumber: student.documentNumber || '',
      birthDate: student.birthDate || null,
      entryDate: student.entryDate || billingProfile?.entryDate || null,
      age: calculateAge(student.birthDate),
      bloodType: student.bloodType || '',
      medicalProfile: student.medicalProfile || {},
      birthPlace: student.birthPlace || '',
      address: student.address || '',
      enrollmentBonusInstallments: billingProfile?.enrollmentBonusInstallments || 1,
      annualTuitionInstallments: billingProfile?.annualTuitionInstallments || 1,
      initialEnrollmentAndFirstTuitionPaid: Boolean(billingProfile?.initialEnrollmentAndFirstTuitionPaid),
      annualTuitionAdditionalDiscountPercent: billingProfile?.annualTuitionAdditionalDiscountPercent ?? '',
      annualTuitionAdditionalDiscountLabel: billingProfile?.annualTuitionAdditionalDiscountLabel || '',
      monthlyTuitionAdditionalDiscountPercent: billingProfile?.monthlyTuitionAdditionalDiscountPercent ?? '',
      monthlyTuitionAdditionalDiscountLabel: billingProfile?.monthlyTuitionAdditionalDiscountLabel || '',
      motherId: mother?._id || null,
      motherName: mother?.name || '',
      motherDocumentType: mother?.documentType || '',
      motherDocumentNumber: mother?.documentNumber || '',
      motherPhone: mother?.phone || '',
      motherEmail: mother?.email || '',
      fatherId: father?._id || null,
      fatherName: father?.name || '',
      fatherDocumentType: father?.documentType || '',
      fatherDocumentNumber: father?.documentNumber || '',
      fatherPhone: father?.phone || '',
      fatherEmail: father?.email || '',
    };
  });
}

function generateTemporaryPassword() {
  return `Comergio-${crypto.randomBytes(3).toString('hex')}`;
}

function buildBaseUsername(parent) {
  const documentNumber = normalizeText(parent?.documentNumber).replace(/\s+/g, '');
  if (documentNumber) {
    return documentNumber.toLowerCase();
  }

  const email = normalizeEmail(parent?.email);
  if (email) {
    return email.split('@')[0];
  }

  return normalizeText(parent?.name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 24);
}

async function ensureUniqueUsername(baseUsername) {
  const normalizedBase = normalizeText(baseUsername).toLowerCase() || `user.${crypto.randomBytes(2).toString('hex')}`;
  let candidate = normalizedBase;
  let attempt = 1;

  while (await User.findOne({ username: candidate }).select('_id').lean()) {
    candidate = `${normalizedBase}.${attempt}`.slice(0, 32);
    attempt += 1;
  }

  return candidate;
}

function calculateOverdueMonths(dueDateValue, referenceDate = new Date()) {
  const dueDate = new Date(dueDateValue);
  if (Number.isNaN(dueDate.getTime()) || dueDate > referenceDate) {
    return 0;
  }

  let months = ((referenceDate.getFullYear() - dueDate.getFullYear()) * 12) + (referenceDate.getMonth() - dueDate.getMonth());
  if (referenceDate.getDate() < dueDate.getDate()) {
    months -= 1;
  }

  return Math.max(0, months);
}

function resolveBucketLabel(overdueMonths) {
  if (overdueMonths >= 6) return '6_plus';
  if (overdueMonths >= 5) return '5';
  if (overdueMonths >= 4) return '4';
  if (overdueMonths >= 3) return '3';
  if (overdueMonths >= 2) return '2';
  return '';
}

async function resolveAudienceMembers({ schoolId, audienceType, gradeTargets, courseTargets, parentTargets, studentTargets }) {
  const normalizedAudienceType = normalizeText(audienceType) || 'general';
  const resolvedParentIds = new Set();
  const resolvedStudentIds = new Set();
  const normalizedGradeTargets = normalizeArray(gradeTargets);
  const normalizedCourseTargets = normalizeArray(courseTargets);
  const parentObjectIds = (Array.isArray(parentTargets) ? parentTargets : []).map(toObjectId).filter(Boolean);
  const studentObjectIds = (Array.isArray(studentTargets) ? studentTargets : []).map(toObjectId).filter(Boolean);

  if (normalizedAudienceType === 'general') {
    const parents = await User.find({ schoolId, role: 'parent', status: 'active', deletedAt: null })
      .select('_id')
      .lean();
    parents.forEach((parent) => resolvedParentIds.add(String(parent._id)));
  } else if (normalizedAudienceType === 'individual') {
    parentObjectIds.forEach((parentId) => resolvedParentIds.add(String(parentId)));
    studentObjectIds.forEach((studentId) => resolvedStudentIds.add(String(studentId)));
  } else {
    const studentFilter = { schoolId, status: 'active', deletedAt: null };
    if (normalizedAudienceType === 'grade') {
      const students = await Student.find(studentFilter).select('_id grade').lean();
      students
        .filter((student) => normalizedGradeTargets.includes(extractAcademicGradeLevel(student.grade)))
        .forEach((student) => resolvedStudentIds.add(String(student._id)));
    }
    if (normalizedAudienceType === 'course') {
      const academicStructure = await ensureAcademicStructureConfiguration(schoolId);
      const serializedAcademicStructure = serializeAcademicStructureConfiguration(academicStructure);
      const courseResolvers = buildAcademicCourseTargetResolvers(serializedAcademicStructure);
      const selectedCourseResolvers = normalizedCourseTargets
        .map((target) => courseResolvers.get(target))
        .filter(Boolean);
      const students = await Student.find(studentFilter).select('_id grade course').lean();
      students
        .filter((student) => {
          const studentGrade = normalizeText(student.grade);
          const normalizedStudentGrade = normalizeAcademicStructureGradeKey(student.grade);
          const studentGradeLevel = extractAcademicGradeLevel(student.grade);
          const studentCourse = normalizeText(student.course);
          const studentCourseCandidates = [studentCourse, `${studentGrade}${studentCourse}`, `${normalizedStudentGrade}${studentCourse}`, `${studentGradeLevel}${studentCourse}`]
            .map(normalizeText)
            .filter(Boolean);

          if (normalizedCourseTargets.includes(studentGrade) || normalizedCourseTargets.includes(normalizedStudentGrade) || normalizedCourseTargets.includes(studentGradeLevel) || normalizedCourseTargets.includes(studentCourse) || studentCourseCandidates.some((candidate) => normalizedCourseTargets.includes(candidate))) {
            return true;
          }

          return selectedCourseResolvers.some((course) => {
            const courseGradeLevel = extractAcademicGradeLevel(course.gradeKey || course.gradeLabel);
            const sameGrade = !course.gradeKey || course.gradeKey === normalizedStudentGrade || course.gradeKey === studentGrade || (courseGradeLevel && courseGradeLevel === studentGradeLevel);
            if (!sameGrade) {
              return false;
            }

            const aliases = [course.value, course.label, course.section, ...(Array.isArray(course.aliases) ? course.aliases : [])]
              .map(normalizeText)
              .filter(Boolean);
            if (aliases.includes(studentGrade) || aliases.includes(normalizedStudentGrade) || aliases.includes(studentGradeLevel)) {
              return true;
            }
            return aliases.length === 0 || aliases.some((alias) => studentCourseCandidates.includes(alias));
          });
        })
        .forEach((student) => resolvedStudentIds.add(String(student._id)));
    }
  }

  if (resolvedStudentIds.size > 0) {
    const links = await ParentStudentLink.find({
      schoolId,
      studentId: { $in: Array.from(resolvedStudentIds).map((id) => new mongoose.Types.ObjectId(id)) },
      status: 'active',
    })
      .select('parentId studentId')
      .lean();

    links.forEach((link) => {
      resolvedParentIds.add(String(link.parentId));
      resolvedStudentIds.add(String(link.studentId));
    });
  }

  const parents = await User.find({
    schoolId,
    _id: { $in: Array.from(resolvedParentIds).map((id) => new mongoose.Types.ObjectId(id)) },
    role: 'parent',
    status: 'active',
    deletedAt: null,
  })
    .select('name email phone documentNumber address')
    .lean();

  const students = resolvedStudentIds.size > 0
    ? await Student.find({
      schoolId,
      _id: { $in: Array.from(resolvedStudentIds).map((id) => new mongoose.Types.ObjectId(id)) },
    })
      .select('name grade course')
      .lean()
    : [];

  return {
    parents,
    students,
    parentIds: parents.map((parent) => parent._id),
    studentIds: students.map((student) => student._id),
  };
}

async function dispatchCommunication({ schoolId, schoolName, communication, parents }) {
  const parentIds = parents.map((parent) => parent._id);
  const pushResult = communication.channels?.push
    ? await queueNotificationsForParents({
      schoolId,
      parentIds,
      title: communication.title,
      body: communication.body,
      payload: {
        type: 'academic.communication',
        communicationId: communication._id,
        url: buildParentPushUrl('academic.communication'),
      },
    })
    : { notificationsCreated: 0, tokensFound: 0 };

  let emailed = 0;
  if (ACADEMIC_COMMUNICATION_EMAIL_DELIVERY_ENABLED && communication.channels?.email) {
    for (const parent of parents) {
      if (!normalizeEmail(parent.email)) {
        continue;
      }

      try {
        await sendAcademicCommunicationEmail({
          toEmail: parent.email,
          toName: parent.name,
          schoolName,
          title: communication.emailSubject || communication.title,
          body: communication.body,
          authorName: communication.authorName || communication.createdByName,
        });
        emailed += 1;
      } catch (error) {
        console.warn(`[ACADEMIC_COMMUNICATION_EMAIL_FAILED] parentId=${parent._id} error=${error.message}`);
      }
    }
  }

  return {
    push: pushResult,
    emailed,
  };
}

function dispatchCommunicationInBackground({ schoolId, schoolName, communicationId, parents }) {
  setImmediate(async () => {
    try {
      const communication = await AcademicCommunication.findOne({ _id: communicationId, schoolId });
      if (!communication) {
        return;
      }

      const deliverySummary = await dispatchCommunication({
        schoolId,
        schoolName,
        communication,
        parents,
      });

      communication.deliverySummary = deliverySummary;
      await communication.save();
    } catch (error) {
      console.warn(`[ACADEMIC_COMMUNICATION_BACKGROUND_DELIVERY_FAILED] communicationId=${communicationId} error=${error.message}`);
    }
  });
}

async function dispatchAcademicCalendarAssignmentNotification({ schoolId, assignment }) {
  let parentIds = [];

  if (assignment.scope === 'grades') {
    const targetGradeKeys = new Set((assignment.targetGradeKeys || []).map(normalizeText).filter(Boolean));
    const students = await Student.find({ schoolId, status: 'active', deletedAt: null })
      .select('_id grade')
      .lean();
    const targetStudentIds = students
      .filter((student) => {
        const gradeKey = normalizeAcademicStructureGradeKey(student.grade);
        const gradeLevel = extractAcademicGradeLevel(student.grade);
        return targetGradeKeys.has(gradeKey) || targetGradeKeys.has(gradeLevel);
      })
      .map((student) => student._id);

    if (targetStudentIds.length) {
      const links = await ParentStudentLink.find({ schoolId, studentId: { $in: targetStudentIds }, status: 'active' })
        .select('parentId')
        .lean();
      parentIds = links.map((link) => link.parentId).filter(Boolean);
    }
  } else {
    const parents = await User.find({ schoolId, role: 'parent', status: 'active', deletedAt: null })
      .select('_id')
      .lean();
    parentIds = parents.map((parent) => parent._id).filter(Boolean);
  }

  const uniqueParentIds = [...new Set(parentIds.map((parentId) => String(parentId)))];
  if (!uniqueParentIds.length) {
    return { notificationsCreated: 0, tokensFound: 0 };
  }

  const assignmentType = normalizeText(assignment.type) || 'Actividad';
  return queueNotificationsForParents({
    schoolId,
    parentIds: uniqueParentIds,
    title: `${assignmentType} academica: ${normalizeText(assignment.title)}`,
    body: normalizeText(assignment.body) || `Se publico una nueva asignacion academica para ${new Date(assignment.scheduledAt).toLocaleDateString('es-CO')}.`,
    payload: {
      type: 'academic.calendar_assignment',
      assignmentId: String(assignment._id || ''),
      assignmentType,
      scheduledAt: assignment.scheduledAt,
      url: buildParentPushUrl('academic.calendar_assignment'),
    },
  });
}

function serializeCommunicationRequest(request) {
  if (!request) {
    return null;
  }

  return {
    _id: request._id,
    teacherUserId: request.teacherUserId?._id || request.teacherUserId || null,
    teacherName: request.teacherName || request.teacherUserId?.name || 'Docente',
    courseId: request.courseId?._id || request.courseId || null,
    courseTitle: request.courseTitle || request.courseId?.title || '',
    title: request.title || '',
    body: request.body || '',
    emailSubject: request.emailSubject || '',
    audienceType: request.audienceType || 'general',
    gradeTargets: Array.isArray(request.gradeTargets) ? request.gradeTargets : [],
    courseTargets: Array.isArray(request.courseTargets) ? request.courseTargets : [],
    parentTargets: Array.isArray(request.parentTargets) ? request.parentTargets.map((item) => String(item)) : [],
    studentTargets: Array.isArray(request.studentTargets) ? request.studentTargets.map((item) => String(item)) : [],
    media: Array.isArray(request.media) ? request.media : [],
    channels: {
      push: request.channels?.push !== false,
      email: request.channels?.email !== false,
    },
    status: request.status || 'pending',
    submittedAt: request.submittedAt || request.createdAt || null,
    reviewedAt: request.reviewedAt || null,
    reviewedByName: request.reviewedByName || '',
    reviewNotes: request.reviewNotes || '',
    originalTitle: request.originalTitle || '',
    originalBody: request.originalBody || '',
    originalEmailSubject: request.originalEmailSubject || '',
    publishedCommunicationId: request.publishedCommunicationId || null,
  };
}

async function buildCommunicationRequestSummary(schoolId) {
  const requests = await AcademicCommunicationRequest.find({ schoolId })
    .populate('teacherUserId', 'name username')
    .sort({ status: 1, submittedAt: -1, createdAt: -1 })
    .limit(80)
    .lean();

  const counts = {
    pending: 0,
    approved: 0,
    rejected: 0,
  };

  for (const item of requests) {
    if (Object.prototype.hasOwnProperty.call(counts, item.status)) {
      counts[item.status] += 1;
    }
  }

  return {
    counts,
    items: requests.map(serializeCommunicationRequest),
  };
}

async function dispatchBillingNotice({ schoolId, schoolName, parents, title, intro, charges, pushTitle, pushBody, payload }) {
  const parentIds = parents.map((parent) => parent._id);
  const pushResult = await queueNotificationsForParents({
    schoolId,
    parentIds,
    title: pushTitle,
    body: pushBody,
    payload,
  });

  let emailed = 0;
  for (const parent of parents) {
    if (!normalizeEmail(parent.email)) {
      continue;
    }

    const parentCharges = charges.filter((charge) => String(charge.parentId) === String(parent._id));
    if (!parentCharges.length) {
      continue;
    }

    try {
      await sendAcademicBillingEmail({
        toEmail: parent.email,
        toName: parent.name,
        schoolName,
        title,
        intro,
        charges: parentCharges.map((charge) => ({
          concept: charge.concept,
          studentName: charge.studentName,
          dueDateLabel: formatDateLabel(charge.dueDate),
          amountLabel: formatCurrency(charge.amount),
        })),
      });
      emailed += 1;
    } catch (error) {
      console.warn(`[ACADEMIC_BILLING_EMAIL_FAILED] parentId=${parent._id} error=${error.message}`);
    }
  }

  return { push: pushResult, emailed };
}

function isPendingEnrollmentCharge(charge = {}) {
  return String(charge.category || '') === 'annual_tuition'
    && ['pending', 'overdue'].includes(String(charge.status || ''))
    && Number(charge.amount || charge.outstandingAmount || 0) > 0;
}

function isPendingEnrollmentPlanRow(row = {}) {
  return String(row.category || '') === 'annual_tuition'
    && ['pending', 'overdue', 'upcoming'].includes(String(row.status || ''))
    && Number(row.outstandingAmount || row.amount || 0) > 0;
}

function summarizeStudentAccountEnrollment(account = {}) {
  const enrollmentCharges = (account.charges || []).filter((charge) => String(charge.category || '') === 'annual_tuition');
  const enrollmentPlanRows = (account.paymentPlan?.rows || []).filter((row) => String(row.category || '') === 'annual_tuition');
  const pendingEnrollmentCharges = enrollmentCharges.filter(isPendingEnrollmentCharge);
  const pendingEnrollmentPlanRows = enrollmentPlanRows.filter(isPendingEnrollmentPlanRow);
  const pendingAmountFromCharges = pendingEnrollmentCharges.reduce((sum, charge) => sum + Number(charge.amount || 0), 0);
  const pendingAmountFromPlan = pendingEnrollmentPlanRows
    .filter((row) => {
      const chargeId = String(row.existingChargeId || '').trim();
      if (!chargeId) return true;
      return !pendingEnrollmentCharges.some((charge) => String(charge._id) === chargeId);
    })
    .reduce((sum, row) => sum + Number(row.outstandingAmount || row.amount || 0), 0);
  const enrollmentPendingAmount = pendingAmountFromCharges + pendingAmountFromPlan;
  const enrollmentPaidAmount = Math.max(
    enrollmentCharges.reduce((sum, charge) => sum + Number(charge.paidAmount || 0), 0),
    enrollmentPlanRows.reduce((sum, row) => sum + Number(row.paidAmount || 0), 0),
    enrollmentPlanRows.some((row) => String(row.status || '') === 'paid') ? enrollmentPlanRows
      .filter((row) => String(row.status || '') === 'paid')
      .reduce((sum, row) => sum + Number(row.paidAmount || row.chargeAmount || row.amount || 0), 0) : 0
  );
  const hasEnrollmentActivity = enrollmentCharges.length > 0
    || enrollmentPlanRows.length > 0
    || enrollmentPaidAmount > 0
    || enrollmentPendingAmount > 0;
  const enrollmentStatus = enrollmentPendingAmount > 0
    ? 'pending'
    : (hasEnrollmentActivity ? 'paid' : 'none');
  const hasEnrollmentOverdue = pendingEnrollmentCharges.some((charge) => String(charge.status) === 'overdue' || Number(charge.overdueMonths || 0) > 0)
    || pendingEnrollmentPlanRows.some((row) => String(row.status) === 'overdue');
  const pensionPlanRows = (account.paymentPlan?.rows || []).filter((row) => String(row.category || '') === 'monthly_tuition');
  const pensionPendingAmount = pensionPlanRows
    .filter((row) => String(row.status || '') !== 'paid' && Number(row.outstandingAmount || row.amount || 0) > 0)
    .reduce((sum, row) => sum + Number(row.outstandingAmount || row.amount || 0), 0);
  const pensionPaidAmount = pensionPlanRows
    .filter((row) => String(row.status || '') === 'paid')
    .reduce((sum, row) => sum + Number(row.paidAmount || row.chargeAmount || row.amount || 0), 0);
  const hasPensionActivity = pensionPlanRows.length > 0 || pensionPendingAmount > 0 || pensionPaidAmount > 0;

  return {
    enrollmentStatus,
    enrollmentStatusLabel: enrollmentStatus === 'pending'
      ? (hasEnrollmentOverdue ? 'Matrícula en mora' : 'Matrícula pendiente')
      : (enrollmentStatus === 'paid' ? 'Matrícula pagada' : 'Sin matrícula'),
    enrollmentPendingAmount,
    enrollmentPaidAmount,
    enrollmentOverdueMonths: pendingEnrollmentCharges.reduce((maxMonths, charge) => Math.max(maxMonths, Number(charge.overdueMonths || 0)), 0),
    pensionPendingAmount,
    pensionPaidAmount,
    hasPensionActivity,
  };
}

function enrichStudentAccountsForEnrollmentBilling(studentAccounts = []) {
  return studentAccounts.map((account) => {
    const enrollmentSummary = summarizeStudentAccountEnrollment(account);

    return {
      ...account,
      ...enrollmentSummary,
    };
  });
}

async function buildBillingSummary(schoolId) {
  const now = new Date();
  let [charges, recentPayments, chargePayments, billingProfiles, primaryParentByStudentId, followUps, students] = await Promise.all([
    AcademicCharge.find({ schoolId })
      .populate('parentId', 'name email phone')
      .populate('studentId', 'name grade course')
      .sort({ dueDate: 1, createdAt: -1 })
      .lean(),
    AcademicChargePayment.find({ schoolId })
      .populate('chargeId', 'concept')
      .populate('parentId', 'name')
      .populate('studentId', 'name grade course')
      .sort({ paidAt: -1, createdAt: -1 })
      .limit(25)
      .lean(),
    AcademicChargePayment.find({ schoolId })
      .select('chargeId parentId studentId recordedByUserId recordedByRole amount method notes paidAt createdAt')
      .sort({ paidAt: -1, createdAt: -1 })
      .lean(),
    StudentBillingProfile.find({ schoolId, active: true }).lean(),
    resolvePrimaryParentContacts(schoolId),
    buildBillingFollowUpSummary(schoolId),
    Student.find({ schoolId, deletedAt: null })
      .select('name grade course documentNumber')
      .sort({ name: 1 })
      .lean(),
  ]);

  const billingProfileMap = new Map(billingProfiles.map((profile) => [String(profile._id), profile]));
  const billingProfileByStudentId = new Map(billingProfiles.map((profile) => [String(profile.studentId || ''), profile]));
  const feeConfiguration = await ensureAcademicFeeConfiguration(schoolId, students.map((student) => student.grade).filter(Boolean));
  const syncedAnnualTuitionDueDates = await syncAnnualTuitionDueDatesFromRectoria({
    schoolId,
    billingProfiles,
    feeConfiguration,
    referenceDate: now,
  });
  if (syncedAnnualTuitionDueDates > 0) {
    charges = await AcademicCharge.find({ schoolId })
      .populate('parentId', 'name email phone')
      .populate('studentId', 'name grade course')
      .sort({ dueDate: 1, createdAt: -1 })
      .lean();
  }
  const paymentTotalsByChargeId = new Map();
  const paymentsByChargeId = new Map();
  chargePayments.forEach((payment) => {
    const chargeKey = String(payment.chargeId || '').trim();
    if (!chargeKey) return;
    paymentTotalsByChargeId.set(chargeKey, Number(paymentTotalsByChargeId.get(chargeKey) || 0) + Number(payment.amount || 0));
    if (!paymentsByChargeId.has(chargeKey)) paymentsByChargeId.set(chargeKey, []);
    paymentsByChargeId.get(chargeKey).push(payment);
  });

  const chargeById = new Map();

  const pendingCharges = [];
  const dedupedChargeKeys = new Map();
  charges.forEach((charge) => {
    chargeById.set(String(charge._id), charge);
    const billingProfile = billingProfileMap.get(String(charge.billingProfileId || '')) || null;
    const pricing = resolveAcademicChargeAmounts(charge, billingProfile, now, feeConfiguration);
    const rawPaidAmount = Number(paymentTotalsByChargeId.get(String(charge._id)) || 0);
    const settledPaidAmount = String(charge.status) === 'paid' && rawPaidAmount <= 0 ? pricing.effectiveAmount : rawPaidAmount;
    const outstandingAmount = String(charge.status) === 'paid' ? 0 : Math.max(0, pricing.effectiveAmount - settledPaidAmount);
    const overdueMonths = ['pending', 'overdue'].includes(String(charge.status)) && outstandingAmount > 0 ? calculateOverdueMonths(charge.dueDate, now) : 0;
    const normalizedStatus = outstandingAmount <= 0 ? 'paid' : (charge.status === 'pending' && overdueMonths > 0 ? 'overdue' : charge.status);
    const studentId = String(charge.studentId?._id || charge.studentId || '').trim();
    const primaryParent = studentId ? primaryParentByStudentId.get(studentId) || null : null;
    const displayParentId = String(primaryParent?._id || charge.parentId?._id || charge.parentId || '').trim();
    const entry = {
      ...charge,
      status: normalizedStatus,
      overdueMonths,
      baseAmount: pricing.baseAmount,
      chargeAmount: pricing.effectiveAmount,
      paidAmount: Math.min(pricing.effectiveAmount, settledPaidAmount),
      outstandingAmount,
      amount: outstandingAmount,
      discountPercent: pricing.discountPercent,
      fixedDiscountAmount: pricing.fixedDiscountAmount,
      benefitLabel: pricing.benefitLabel,
      parentId: displayParentId || charge.parentId,
      parentName: primaryParent?.name || charge.parentId?.name || 'Acudiente',
      parentPhone: primaryParent?.phone || charge.parentId?.phone || '',
      studentName: charge.studentId?.name || 'Familia',
      grade: charge.studentId?.grade || charge.targetGrade || '',
      course: charge.studentId?.course || charge.targetCourse || '',
    };
    const dedupKey = buildBillingChargeDedupKey(entry, displayParentId);
    const existing = dedupedChargeKeys.get(dedupKey);
    const rawParentId = String(charge.parentId?._id || charge.parentId || '').trim();
    const prefersCurrent = displayParentId && rawParentId === displayParentId;

    if (!existing || prefersCurrent) {
      dedupedChargeKeys.set(dedupKey, entry);
    }
  });

  pendingCharges.push(...Array.from(dedupedChargeKeys.values()));

  const chargesByStudentId = new Map();
  pendingCharges.forEach((charge) => {
    const studentKey = String(charge.studentId?._id || charge.studentId || '').trim();
    if (!studentKey) return;
    if (!chargesByStudentId.has(studentKey)) chargesByStudentId.set(studentKey, []);
    chargesByStudentId.get(studentKey).push(charge);
  });

  const paymentsByStudentId = new Map();
  chargePayments.forEach((payment) => {
    const studentKey = String(payment.studentId || chargeById.get(String(payment.chargeId || ''))?.studentId?._id || chargeById.get(String(payment.chargeId || ''))?.studentId || '').trim();
    if (!studentKey) return;
    if (!paymentsByStudentId.has(studentKey)) paymentsByStudentId.set(studentKey, []);
    const charge = chargeById.get(String(payment.chargeId || '')) || null;
    paymentsByStudentId.get(studentKey).push({
      _id: payment._id,
      chargeId: payment.chargeId,
      concept: charge?.concept || payment.notes || 'Pago académico',
      amount: Number(payment.amount || 0),
      method: payment.method || '',
      methodLabel: labelAcademicPaymentMethod(payment.method),
      notes: payment.notes || '',
      paidAt: payment.paidAt || payment.createdAt,
      recordedByRole: payment.recordedByRole || '',
    });
  });

  const studentAccounts = students.map((student) => {
    const studentId = String(student._id);
    const relatedCharges = (chargesByStudentId.get(studentId) || [])
      .sort((left, right) => new Date(left.dueDate || 0) - new Date(right.dueDate || 0));
    const pendingStudentCharges = relatedCharges.filter((charge) => ['pending', 'overdue'].includes(String(charge.status)) && Number(charge.outstandingAmount || charge.amount || 0) > 0);
    const hasOverdue = pendingStudentCharges.some((charge) => String(charge.status) === 'overdue' || Number(charge.overdueMonths || 0) > 0);
    const pendingAmount = pendingStudentCharges.reduce((sum, charge) => sum + Number(charge.outstandingAmount || charge.amount || 0), 0);
    const primaryParent = primaryParentByStudentId.get(studentId) || null;
    const payments = paymentsByStudentId.get(studentId) || [];
    const billingProfile = billingProfileByStudentId.get(studentId) || null;
    const paymentPlan = buildAcademicStudentPaymentPlan({
      student,
      billingProfile,
      feeConfiguration,
      relatedCharges,
      paymentsByChargeId,
      now,
    });

    return {
      studentId,
      studentName: student.name || 'Alumno',
      documentNumber: student.documentNumber || '',
      grade: student.grade || '',
      course: student.course || '',
      parentId: primaryParent?._id || '',
      parentName: primaryParent?.name || 'Sin acudiente principal',
      parentPhone: primaryParent?.phone || '',
      parentEmail: primaryParent?.email || '',
      billingProfileId: billingProfile?._id || '',
      monthlyTuitionAdditionalDiscountType: billingProfile?.monthlyTuitionAdditionalDiscountType || 'percent',
      monthlyTuitionAdditionalDiscountPercent: Number(billingProfile?.monthlyTuitionAdditionalDiscountPercent || 0),
      monthlyTuitionAdditionalDiscountFixedAmount: Number(billingProfile?.monthlyTuitionAdditionalDiscountFixedAmount || 0),
      monthlyTuitionAdditionalDiscountLabel: billingProfile?.monthlyTuitionAdditionalDiscountLabel || '',
      pendingAmount,
      pendingCount: pendingStudentCharges.length,
      paidAmount: payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
      overdueMonths: pendingStudentCharges.reduce((maxMonths, charge) => Math.max(maxMonths, Number(charge.overdueMonths || 0)), 0),
      status: pendingStudentCharges.length ? (hasOverdue ? 'overdue' : 'pending') : 'current',
      statusLabel: pendingStudentCharges.length ? (hasOverdue ? 'En mora' : 'Pendiente') : 'Al día',
      charges: relatedCharges.map((charge) => ({
        _id: charge._id,
        concept: charge.concept,
        category: charge.category,
        dueDate: charge.dueDate,
        status: charge.status,
        amount: Number(charge.outstandingAmount || charge.amount || 0),
        chargeAmount: Number(charge.chargeAmount || 0),
        paidAmount: Number(charge.paidAmount || 0),
        originalAmount: Number(charge.originalAmount || charge.baseAmount || charge.chargeAmount || 0),
        overdueMonths: Number(charge.overdueMonths || 0),
      })),
      payments,
      paymentPlan,
    };
  }).sort((left, right) => {
    if (Number(right.pendingAmount > 0) !== Number(left.pendingAmount > 0)) return Number(right.pendingAmount > 0) - Number(left.pendingAmount > 0);
    if (right.overdueMonths !== left.overdueMonths) return right.overdueMonths - left.overdueMonths;
    if (right.pendingAmount !== left.pendingAmount) return right.pendingAmount - left.pendingAmount;
    return String(left.studentName).localeCompare(String(right.studentName), 'es', { numeric: true });
  });

  const overdueParentsMap = new Map();
  for (const charge of pendingCharges) {
    if (!['pending', 'overdue'].includes(String(charge.status)) || charge.overdueMonths < 2) {
      continue;
    }

    const parentKey = String(charge.parentId?._id || charge.parentId || '');
    if (!parentKey) {
      continue;
    }

    const current = overdueParentsMap.get(parentKey) || {
      parentId: charge.parentId?._id || charge.parentId,
      parentName: charge.parentName,
      parentPhone: charge.parentPhone || '',
      overdueMonths: 0,
      outstandingAmount: 0,
      bucket: '',
      students: new Set(),
    };

    current.overdueMonths = Math.max(current.overdueMonths, charge.overdueMonths);
    current.outstandingAmount += Number(charge.amount || 0);
    current.bucket = resolveBucketLabel(current.overdueMonths);
    current.students.add(charge.studentName);
    overdueParentsMap.set(parentKey, current);
  }

  const bucketCounts = { '2': 0, '3': 0, '4': 0, '5': 0, '6_plus': 0 };
  const overdueParents = Array.from(overdueParentsMap.values())
    .map((item) => ({
      ...item,
      students: Array.from(item.students),
    }))
    .sort((left, right) => right.overdueMonths - left.overdueMonths || right.outstandingAmount - left.outstandingAmount);

  overdueParents.forEach((item) => {
    if (item.bucket) {
      bucketCounts[item.bucket] += 1;
    }
  });

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const paidThisMonth = recentPayments
    .filter((payment) => new Date(payment.paidAt || payment.createdAt) >= startOfMonth)
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  const millenniumEnrollmentFocus = isMillenniumSchoolId(schoolId);
  const scopedStudentAccounts = millenniumEnrollmentFocus
    ? enrichStudentAccountsForEnrollmentBilling(studentAccounts)
    : studentAccounts;
  const enrollmentPendingAccounts = scopedStudentAccounts.filter(
    (account) => account.enrollmentStatus === 'pending' && Number(account.enrollmentPendingAmount || 0) > 0,
  );
  const enrollmentPaidAccounts = scopedStudentAccounts.filter((account) => account.enrollmentStatus === 'paid');
  const scopedPendingCharges = millenniumEnrollmentFocus
    ? pendingCharges.filter((charge) => String(charge.category || '') === 'annual_tuition')
    : pendingCharges;
  const activePendingCharges = scopedPendingCharges.filter((charge) => ['pending', 'overdue'].includes(String(charge.status)));

  return {
    billingFocus: millenniumEnrollmentFocus ? 'enrollment' : 'all',
    kpis: {
      pendingAmount: millenniumEnrollmentFocus
        ? enrollmentPendingAccounts.reduce((sum, account) => sum + Number(account.enrollmentPendingAmount || 0), 0)
        : activePendingCharges.reduce((sum, charge) => sum + Number(charge.amount || 0), 0),
      totalPendingCharges: millenniumEnrollmentFocus
        ? enrollmentPendingAccounts.length
        : activePendingCharges.length,
      paidThisMonth,
      overdueBuckets: millenniumEnrollmentFocus ? { '2': 0, '3': 0, '4': 0, '5': 0, '6_plus': 0 } : bucketCounts,
      enrollmentPendingCount: enrollmentPendingAccounts.length,
      enrollmentPaidCount: enrollmentPaidAccounts.length,
      enrollmentPaidAmount: enrollmentPaidAccounts.reduce((sum, account) => sum + Number(account.enrollmentPaidAmount || 0), 0),
      pensionPendingAmount: scopedStudentAccounts.reduce((sum, account) => sum + Number(account.pensionPendingAmount || 0), 0),
      pensionStudentsCount: scopedStudentAccounts.filter((account) => account.hasPensionActivity).length,
    },
    charges: scopedPendingCharges,
    studentAccounts: scopedStudentAccounts,
    recentPayments: recentPayments.map((payment) => ({
      ...payment,
      parentId: primaryParentByStudentId.get(String(payment.studentId?._id || payment.studentId || ''))?._id || payment.parentId,
      parentName: primaryParentByStudentId.get(String(payment.studentId?._id || payment.studentId || ''))?.name || payment.parentId?.name || 'Acudiente',
      parentPhone: primaryParentByStudentId.get(String(payment.studentId?._id || payment.studentId || ''))?.phone || '',
      studentName: payment.studentId?.name || 'Familia',
      grade: payment.studentId?.grade || '',
      course: payment.studentId?.course || '',
      concept: payment.chargeId?.concept || payment.notes || 'Pago académico',
      methodLabel: labelAcademicPaymentMethod(payment.method),
      paidAt: payment.paidAt || payment.createdAt,
    })),
    overdueParents,
    followUps,
  };
}

function createEmptyBillingSummary() {
  return {
    billingFocus: 'all',
    kpis: {
      pendingAmount: 0,
      totalPendingCharges: 0,
      paidThisMonth: 0,
      overdueBuckets: { '2': 0, '3': 0, '4': 0, '5': 0, '6_plus': 0 },
      enrollmentPendingCount: 0,
      enrollmentPaidCount: 0,
      enrollmentPaidAmount: 0,
      pensionPendingAmount: 0,
      pensionStudentsCount: 0,
    },
    charges: [],
    studentAccounts: [],
    recentPayments: [],
    overdueParents: [],
    followUps: [],
  };
}

function createEmptyCommunicationRequestSummary() {
  return {
    counts: {
      pending: 0,
      approved: 0,
      rejected: 0,
    },
    items: [],
  };
}

async function buildBillingSummarySafely(schoolId) {
  try {
    return await buildBillingSummary(schoolId);
  } catch (error) {
    console.warn(`[ACADEMIC_BILLING_SUMMARY_FAILED] schoolId=${schoolId} error=${error.message}`);
    return createEmptyBillingSummary();
  }
}

async function createCharge({ schoolId, createdByUserId, createdByRole, parentId, studentId = null, billingProfileId = null, category, concept, description = '', amount, originalAmount = null, dueDate, audienceType, targetGrade = '', targetCourse = '', monthKey = '' }) {
  return AcademicCharge.create({
    schoolId,
    createdByUserId,
    createdByRole,
    parentId,
    studentId,
    billingProfileId,
    category,
    concept,
    description,
    amount: Number(amount || 0),
    originalAmount: Number(originalAmount == null ? amount : originalAmount),
    dueDate,
    audienceType,
    targetGrade,
    targetCourse,
    monthKey,
  });
}

async function getAcademicChargeOutstandingAmount(charge, referenceDate = new Date()) {
  const [billingProfile, payments, feeConfiguration] = await Promise.all([
    charge.billingProfileId
      ? StudentBillingProfile.findOne({ _id: charge.billingProfileId, schoolId: charge.schoolId }).lean()
      : null,
    AcademicChargePayment.find({ schoolId: charge.schoolId, chargeId: charge._id }).select('amount').lean(),
    String(charge?.category || '') === 'annual_tuition'
      ? ensureAcademicFeeConfiguration(charge.schoolId, [])
      : Promise.resolve(null),
  ]);
  const pricing = resolveAcademicChargeAmounts(charge, billingProfile, referenceDate, feeConfiguration || {});
  const paidAmount = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  return {
    chargeAmount: pricing.effectiveAmount,
    paidAmount,
    outstandingAmount: Math.max(0, pricing.effectiveAmount - paidAmount),
  };
}

function resolveAcademicChargePaymentReferenceDate(charge, paidAt = new Date()) {
  const parsedPaidAt = paidAt instanceof Date ? paidAt : new Date(paidAt);
  const safePaidAt = Number.isNaN(parsedPaidAt.getTime()) ? new Date() : parsedPaidAt;
  const dueDate = new Date(charge?.dueDate || safePaidAt);
  if (String(charge?.category || '') === 'monthly_tuition' && !Number.isNaN(dueDate.getTime()) && dueDate.getTime() >= safePaidAt.getTime()) {
    return dueDate;
  }

  return safePaidAt;
}

function normalizeAcademicManualPaymentMethod(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (['cash', 'bank_transfer', 'card', 'pse', 'epayco', 'bold', 'wompi', 'other'].includes(normalized)) {
    return normalized;
  }
  if (['transferencia', 'transfer', 'bank'].includes(normalized)) return 'bank_transfer';
  if (['datafono', 'dataphone', 'tarjeta'].includes(normalized)) return 'card';
  if (['efectivo'].includes(normalized)) return 'cash';
  return 'other';
}

async function markAcademicChargeAsPaidAtEnrollment({ charge, schoolId, parentId, studentId, recordedByUserId, recordedByRole, amount }) {
  const paidAt = new Date();
  const payment = await AcademicChargePayment.create({
    schoolId,
    chargeId: charge._id,
    studentId: studentId || charge.studentId || null,
    parentId,
    recordedByUserId,
    recordedByRole,
    amount: Number(amount || charge.amount || 0),
    method: 'other',
    notes: 'Marcado como pagado al registrar la matrícula.',
    paidAt,
  });

  charge.status = 'paid';
  charge.paidAt = payment.paidAt;
  charge.paymentMethod = payment.method;
  await charge.save();
  return payment;
}

function normalizeAcademicStudentIdentity(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normalizeAcademicDateIdentity(value) {
  if (!value) {
    return '';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return parsed.toISOString().slice(0, 10);
}

async function findExistingEnrollmentStudent({ schoolId, rawStudent, linkedParents }) {
  const documentNumber = normalizeText(rawStudent?.documentNumber);
  if (documentNumber) {
    const byDocument = await Student.findOne({ schoolId, documentNumber, deletedAt: null });
    if (byDocument) {
      return byDocument;
    }
  }

  const firstName = normalizeText(rawStudent?.firstName);
  const lastName = normalizeText(rawStudent?.lastName);
  const studentName = normalizeText(`${firstName} ${lastName}`);
  const grade = normalizeText(rawStudent?.grade);
  const parentIds = linkedParents.map((parent) => parent?.user?._id).filter(Boolean);

  if (!studentName || !grade || parentIds.length === 0) {
    return null;
  }

  const candidateStudents = await Student.find({ schoolId, grade, deletedAt: null })
    .select('name firstName lastName grade course birthDate documentNumber')
    .sort({ createdAt: 1 });
  const normalizedTargetName = normalizeAcademicStudentIdentity(studentName);
  const targetBirthDate = normalizeAcademicDateIdentity(rawStudent?.birthDate);
  const matchingCandidates = candidateStudents.filter((student) => {
    const candidateName = normalizeAcademicStudentIdentity(`${student.firstName || ''} ${student.lastName || ''}`) || normalizeAcademicStudentIdentity(student.name);
    if (candidateName !== normalizedTargetName) {
      return false;
    }

    if (targetBirthDate) {
      return normalizeAcademicDateIdentity(student.birthDate) === targetBirthDate;
    }

    return true;
  });

  if (matchingCandidates.length === 0) {
    return null;
  }

  const linkedCandidate = await ParentStudentLink.findOne({
    schoolId,
    parentId: { $in: parentIds },
    studentId: { $in: matchingCandidates.map((student) => student._id) },
    status: 'active',
  }).sort({ createdAt: 1 });

  if (!linkedCandidate) {
    return null;
  }

  return matchingCandidates.find((student) => String(student._id) === String(linkedCandidate.studentId)) || null;
}

async function upsertParentAccount({ schoolId, parentData, relationship, matchByLooseIdentity = false }) {
  const name = normalizeText(parentData?.name);
  const email = normalizeEmail(parentData?.email);
  const documentNumber = normalizeText(parentData?.documentNumber);
  const phone = normalizeText(parentData?.phone);
  const requestedPassword = String(parentData?.password || '').trim();

  if (!name && !email && !documentNumber) {
    return null;
  }

  let user = null;
  if (email) {
    user = await User.findOne({ schoolId, email, role: 'parent' });
  }
  if (!user && documentNumber) {
    user = await User.findOne({ schoolId, documentNumber, role: 'parent' });
  }
  if (!user && matchByLooseIdentity && name && phone) {
    user = await User.findOne({
      schoolId,
      role: 'parent',
      phone,
      name: new RegExp(`^${escapeRegex(name)}$`, 'i'),
    });
  }

  const payload = {
    schoolId,
    name: name || relationship,
    email,
    phone,
    address: normalizeText(parentData?.address),
    documentType: normalizeText(parentData?.documentType),
    documentNumber,
    role: 'parent',
    status: 'active',
    deletedAt: null,
  };

  if (user) {
    Object.assign(user, payload);
    if (requestedPassword) {
      user.passwordHash = await bcrypt.hash(requestedPassword, 10);
    }
    await user.save();
    return { user, created: false, temporaryPassword: requestedPassword || '' };
  }

  const temporaryPassword = requestedPassword || generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);
  const username = await ensureUniqueUsername(buildBaseUsername(parentData));
  user = await User.create({
    ...payload,
    username,
    passwordHash,
  });

  return { user, created: true, temporaryPassword };
}

function serializeAcademicSchoolRouteStop(stop) {
  const student = stop?.studentId && typeof stop.studentId === 'object' ? stop.studentId : null;
  const studentId = student?._id || stop?.studentId || null;

  return {
    id: stop?._id ? String(stop._id) : '',
    studentId: studentId ? String(studentId) : '',
    studentName: normalizeText(student?.name || stop?.studentNameSnapshot),
    studentGrade: normalizeText(student?.grade || stop?.studentGrade),
    studentCourse: normalizeText(student?.course || stop?.studentCourse),
    pickupAddress: normalizeText(stop?.pickupAddress),
    notes: normalizeText(stop?.notes),
    order: Number(stop?.order || 0),
    status: normalizeText(stop?.status) || 'pending',
    statusUpdatedAt: stop?.statusUpdatedAt || null,
  };
}

function serializeAcademicSchoolRoute(route) {
  const stops = [...(route?.stops || [])]
    .map(serializeAcademicSchoolRouteStop)
    .sort((left, right) => Number(left.order || 0) - Number(right.order || 0));

  return {
    id: route?._id ? String(route._id) : '',
    driverUserId: route?.driverUserId?._id ? String(route.driverUserId._id) : String(route?.driverUserId || ''),
    routeName: normalizeText(route?.routeName) || 'Ruta escolar',
    status: normalizeText(route?.status) || 'draft',
    startedAt: route?.startedAt || null,
    completedAt: route?.completedAt || null,
    stops,
  };
}

function serializeAcademicSchoolRouteDriver(user) {
  return {
    id: String(user._id),
    name: normalizeText(user.name) || normalizeText(user.username) || 'Conductor de ruta',
    username: normalizeText(user.username),
    email: normalizeText(user.email),
    phone: normalizeText(user.phone),
  };
}

function serializeAcademicSchoolRouteStudent(student) {
  return {
    id: String(student._id),
    name: normalizeText(student.name),
    grade: normalizeText(student.grade),
    course: normalizeText(student.course),
    address: normalizeText(student.address),
    schoolCode: normalizeText(student.schoolCode),
  };
}

async function getAcademicSchoolRouteDriverOrFail({ schoolId, driverUserId }) {
  const driverObjectId = toObjectId(driverUserId);
  if (!driverObjectId) {
    const error = new Error('Selecciona un conductor valido.');
    error.statusCode = 400;
    throw error;
  }

  const driver = await User.findOne({ _id: driverObjectId, schoolId, role: 'school_route', deletedAt: null })
    .select('name username email phone')
    .lean();

  if (!driver) {
    const error = new Error('Conductor de ruta no encontrado.');
    error.statusCode = 404;
    throw error;
  }

  return driver;
}

async function getOrCreateAcademicSchoolRoute({ schoolId, driverUserId }) {
  let route = await CampusSchoolRoute.findOne({ schoolId, driverUserId });
  if (!route) {
    route = await CampusSchoolRoute.create({
      schoolId,
      driverUserId,
      routeName: 'Ruta escolar',
      stops: [],
    });
  }

  return route;
}

router.get('/school-routes', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const [drivers, routes, students] = await Promise.all([
      User.find({ schoolId, role: 'school_route', deletedAt: null })
        .select('name username email phone')
        .sort({ name: 1, username: 1 })
        .lean(),
      CampusSchoolRoute.find({ schoolId })
        .populate('stops.studentId', 'name grade course address schoolCode')
        .sort({ updatedAt: -1 })
        .lean(),
      Student.find({ schoolId, status: 'active', deletedAt: null })
        .select('name grade course address schoolCode')
        .sort({ grade: 1, course: 1, name: 1 })
        .lean(),
    ]);

    return res.json({
      drivers: drivers.map(serializeAcademicSchoolRouteDriver),
      routes: routes.map(serializeAcademicSchoolRoute),
      availableStudents: students.map(serializeAcademicSchoolRouteStudent),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/school-routes/:driverUserId/stops', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const driver = await getAcademicSchoolRouteDriverOrFail({ schoolId, driverUserId: req.params.driverUserId });
    const studentObjectId = toObjectId(req.body?.studentId);
    const pickupAddress = normalizeText(req.body?.pickupAddress).slice(0, 220);
    const notes = normalizeText(req.body?.notes).slice(0, 220);

    if (!studentObjectId) {
      return res.status(400).json({ message: 'Selecciona un alumno valido.' });
    }

    const student = await Student.findOne({ _id: studentObjectId, schoolId, status: 'active', deletedAt: null }).lean();
    if (!student) {
      return res.status(404).json({ message: 'Alumno no encontrado.' });
    }

    const existingRoute = await CampusSchoolRoute.findOne({ schoolId, 'stops.studentId': student._id }).select('driverUserId').lean();
    if (existingRoute) {
      return res.status(409).json({ message: 'Este alumno ya esta asignado a una ruta.' });
    }

    const route = await getOrCreateAcademicSchoolRoute({ schoolId, driverUserId: driver._id });
    const nextOrder = Math.max(0, ...(route.stops || []).map((stop) => Number(stop.order || 0))) + 1;
    route.stops.push({
      studentId: student._id,
      studentNameSnapshot: student.name,
      studentGrade: student.grade,
      studentCourse: student.course,
      pickupAddress: pickupAddress || normalizeText(student.address).slice(0, 220),
      notes,
      order: nextOrder,
      status: 'pending',
      statusUpdatedAt: null,
    });
    await route.save();

    const populatedRoute = await CampusSchoolRoute.findById(route._id)
      .populate('stops.studentId', 'name grade course address schoolCode')
      .lean();

    return res.status(201).json({ route: serializeAcademicSchoolRoute(populatedRoute) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
});

router.patch('/school-routes/:driverUserId/stops/:stopId', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const driver = await getAcademicSchoolRouteDriverOrFail({ schoolId, driverUserId: req.params.driverUserId });
    const route = await getOrCreateAcademicSchoolRoute({ schoolId, driverUserId: driver._id });
    const stop = route.stops.id(req.params.stopId);
    if (!stop) {
      return res.status(404).json({ message: 'Parada no encontrada.' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'pickupAddress')) {
      stop.pickupAddress = normalizeText(req.body.pickupAddress).slice(0, 220);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'notes')) {
      stop.notes = normalizeText(req.body.notes).slice(0, 220);
    }
    await route.save();

    const populatedRoute = await CampusSchoolRoute.findById(route._id)
      .populate('stops.studentId', 'name grade course address schoolCode')
      .lean();

    return res.json({ route: serializeAcademicSchoolRoute(populatedRoute) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
});

router.delete('/school-routes/:driverUserId/stops/:stopId', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const driver = await getAcademicSchoolRouteDriverOrFail({ schoolId, driverUserId: req.params.driverUserId });
    const route = await getOrCreateAcademicSchoolRoute({ schoolId, driverUserId: driver._id });
    const stop = route.stops.id(req.params.stopId);
    if (!stop) {
      return res.status(404).json({ message: 'Parada no encontrada.' });
    }

    stop.deleteOne();
    route.stops
      .sort((left, right) => Number(left.order || 0) - Number(right.order || 0))
      .forEach((routeStop, index) => {
        routeStop.order = index + 1;
      });
    await route.save();

    const populatedRoute = await CampusSchoolRoute.findById(route._id)
      .populate('stops.studentId', 'name grade course address schoolCode')
      .lean();

    return res.json({ route: serializeAcademicSchoolRoute(populatedRoute) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
});

router.get('/bootstrap', async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const isBillingUser = String(req.user.role || '').trim() === 'billing';
    const isCoordinationUser = String(req.user.role || '').trim() === 'coordination';
    const isAdmissionsUser = String(req.user.role || '').trim() === 'admissions';
    if (!isBillingUser && !isAdmissionsUser) {
      await ensureDefaultCommunicationAuthor(schoolId, userId);
    }
    const [parentsResult, studentsResult, communicationsResult, communicationAuthorsResult, campusCoursesResult, calendarAssignmentsResult, billingResult, requestSummaryResult, academicDatabaseResult, academicStructureResult] = await Promise.allSettled([
      User.find({ schoolId, role: 'parent', deletedAt: null }).select('name email phone documentNumber address').sort({ name: 1 }).lean(),
      Student.find({ schoolId, deletedAt: null }).select('name firstName lastName grade course documentNumber gender birthDate bloodType birthPlace address').sort({ name: 1 }).lean(),
      AcademicCommunication.find({ schoolId }).sort({ sentAt: -1, createdAt: -1 }).limit(25).lean(),
      AcademicCommunicationAuthor.find({ schoolId, active: true }).sort({ isDefault: -1, name: 1, createdAt: 1 }).lean(),
      CampusCourse.find({ schoolId, status: 'active' }).select('title subject gradeLevel section studentGradeKey academicContent').sort({ title: 1 }).lean(),
      AcademicCalendarAssignment.find({ schoolId, status: 'published' }).sort({ scheduledAt: 1, createdAt: -1 }).limit(80).lean(),
      buildBillingSummarySafely(schoolId),
      buildCommunicationRequestSummary(schoolId),
      buildAcademicDatabaseSummary(schoolId),
      ensureAcademicStructureConfiguration(schoolId),
    ]);

    const failedSections = [];
    const parents = parentsResult.status === 'fulfilled' ? parentsResult.value : [];
    const students = studentsResult.status === 'fulfilled' ? studentsResult.value : [];
    const communications = communicationsResult.status === 'fulfilled' ? communicationsResult.value : [];
    const communicationAuthors = communicationAuthorsResult.status === 'fulfilled' ? communicationAuthorsResult.value : [];
    const campusCourses = campusCoursesResult.status === 'fulfilled' ? campusCoursesResult.value : [];
    const calendarAssignments = calendarAssignmentsResult.status === 'fulfilled' ? calendarAssignmentsResult.value : [];
    const billing = billingResult.status === 'fulfilled' ? billingResult.value : createEmptyBillingSummary();
    const requestSummary = requestSummaryResult.status === 'fulfilled' ? requestSummaryResult.value : createEmptyCommunicationRequestSummary();
    const academicDatabase = academicDatabaseResult.status === 'fulfilled' ? academicDatabaseResult.value : [];
    const academicStructure = academicStructureResult.status === 'fulfilled' ? academicStructureResult.value : null;

    if (parentsResult.status === 'rejected') failedSections.push(`parents:${parentsResult.reason?.message || 'unknown_error'}`);
    if (studentsResult.status === 'rejected') failedSections.push(`students:${studentsResult.reason?.message || 'unknown_error'}`);
    if (communicationsResult.status === 'rejected') failedSections.push(`communications:${communicationsResult.reason?.message || 'unknown_error'}`);
    if (communicationAuthorsResult.status === 'rejected') failedSections.push(`communicationAuthors:${communicationAuthorsResult.reason?.message || 'unknown_error'}`);
    if (campusCoursesResult.status === 'rejected') failedSections.push(`campusCourses:${campusCoursesResult.reason?.message || 'unknown_error'}`);
    if (calendarAssignmentsResult.status === 'rejected') failedSections.push(`calendarAssignments:${calendarAssignmentsResult.reason?.message || 'unknown_error'}`);
    if (billingResult.status === 'rejected') failedSections.push(`billing:${billingResult.reason?.message || 'unknown_error'}`);
    if (requestSummaryResult.status === 'rejected') failedSections.push(`communicationRequests:${requestSummaryResult.reason?.message || 'unknown_error'}`);
    if (academicDatabaseResult.status === 'rejected') failedSections.push(`academicDatabase:${academicDatabaseResult.reason?.message || 'unknown_error'}`);
    if (academicStructureResult.status === 'rejected') failedSections.push(`academicStructure:${academicStructureResult.reason?.message || 'unknown_error'}`);

    if (failedSections.length > 0) {
      console.warn(`[ACADEMIC_BOOTSTRAP_PARTIAL] schoolId=${schoolId} failures=${failedSections.join(',')}`);
    }

    const serializedAcademicStructure = academicStructure
      ? serializeAcademicStructureConfiguration(academicStructure)
      : {
        academicYear: getCurrentAcademicYear(),
        levels: [],
        subjects: [],
        grades: [],
        scheduleSettings: { groups: [] },
        scheduleBreaks: [],
        teachingAvailability: [],
        subjectLoadTemplates: [],
        gradeSchedules: [],
        academicPeriods: createDefaultAcademicStructurePeriods(),
      };
    const coordinationScope = isCoordinationUser ? resolveCoordinationGradeKeys(serializedAcademicStructure, req.user?.coordinationScope) : { levelKeys: new Set(), gradeKeys: new Set() };
    const visibleAcademicStructure = isCoordinationUser
      ? filterAcademicStructureForCoordination(serializedAcademicStructure, coordinationScope.levelKeys, coordinationScope.gradeKeys)
      : serializedAcademicStructure;
    const visibleStudents = isCoordinationUser
      ? students.filter((student) => coordinationScope.gradeKeys.has(normalizeAcademicStructureGradeKey(student.grade)))
      : students;
    const visibleAcademicDatabase = isCoordinationUser
      ? academicDatabase.filter((student) => coordinationScope.gradeKeys.has(normalizeAcademicStructureGradeKey(student.grade)))
      : academicDatabase;
    const visibleCampusCourses = isCoordinationUser
      ? campusCourses.filter((course) => coordinationScope.gradeKeys.has(normalizeAcademicStructureGradeKey(course.studentGradeKey || course.gradeLevel)))
      : campusCourses;
    const visibleCalendarAssignments = isCoordinationUser
      ? calendarAssignments.filter((item) => normalizeText(item.scope) === 'all_school' || (Array.isArray(item.targetGradeKeys) && item.targetGradeKeys.some((gradeKey) => coordinationScope.gradeKeys.has(normalizeAcademicStructureGradeKey(gradeKey)))))
      : calendarAssignments;

    const structureGradeKeys = visibleAcademicStructure.grades.map((grade) => grade.key);
    const studentGradeKeys = visibleStudents.map((student) => normalizeAcademicStructureGradeKey(student.grade)).filter(Boolean);
    const campusGradeKeys = visibleCampusCourses.map((course) => normalizeAcademicStructureGradeKey(course.studentGradeKey || course.gradeLevel)).filter(Boolean);
    const grades = Array.from(new Set([...structureGradeKeys, ...studentGradeKeys, ...campusGradeKeys]))
      .sort((left, right) => left.localeCompare(right, 'es', { numeric: true }));
    const feeSettingGrades = structureGradeKeys
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right, 'es', { numeric: true }));
    const gradeLabelByKey = new Map(visibleAcademicStructure.grades.map((grade) => [normalizeText(grade.key), normalizeText(grade.label || grade.key)]));
    const academicCourseOptions = buildAcademicStructureCourseOptions(visibleAcademicStructure);
    const courseOptionMap = new Map();
    const addCourseOption = ({ value, label, gradeKey = '', section = '', aliases = [], source = '' }) => {
      const normalizedValue = normalizeText(value);
      if (!normalizedValue || courseOptionMap.has(normalizedValue)) {
        return;
      }

      const normalizedGradeKey = normalizeText(gradeKey);
      const gradeLabel = gradeLabelByKey.get(normalizedGradeKey) || normalizedGradeKey;
      courseOptionMap.set(normalizedValue, {
        value: normalizedValue,
        label: normalizeText(label) || [normalizedValue, gradeLabel].filter(Boolean).join(' · '),
        gradeKey: normalizedGradeKey,
        gradeLabel,
        section: normalizeText(section),
        aliases: Array.isArray(aliases) ? aliases.map(normalizeText).filter(Boolean) : [],
        source,
      });
    };

    academicCourseOptions.forEach(addCourseOption);
    if (courseOptionMap.size === 0) {
      visibleStudents.forEach((student) => {
        const courseValue = normalizeText(student.course);
        const gradeKey = normalizeAcademicStructureGradeKey(student.grade);
        if (!courseValue || courseValue === gradeKey || courseValue === extractAcademicGradeLevel(student.grade)) {
          return;
        }

        const gradeLabel = gradeLabelByKey.get(gradeKey) || normalizeText(student.grade);
        const label = /^[a-z0-9]$/i.test(courseValue) ? `${gradeLabel}${courseValue.toUpperCase()}` : courseValue;
        addCourseOption({
          value: label,
          label,
          gradeKey,
          section: courseValue,
          source: 'students',
        });
      });
      visibleAcademicDatabase.forEach((student) => {
        const courseValue = normalizeText(student.course);
        const gradeKey = normalizeAcademicStructureGradeKey(student.grade);
        if (!courseValue || courseValue === gradeKey || courseValue === extractAcademicGradeLevel(student.grade)) {
          return;
        }

        const gradeLabel = gradeLabelByKey.get(gradeKey) || normalizeText(student.grade);
        const label = /^[a-z0-9]$/i.test(courseValue) ? `${gradeLabel}${courseValue.toUpperCase()}` : courseValue;
        addCourseOption({
          value: label,
          label,
          gradeKey,
          section: courseValue,
          source: 'academic-database',
        });
      });
      visibleCampusCourses.forEach((course) => {
        const gradeKey = normalizeAcademicStructureGradeKey(course.studentGradeKey || course.gradeLevel);
        const section = normalizeText(course.section);
        if (!section) {
          return;
        }

        const gradeLabel = gradeLabelByKey.get(gradeKey) || gradeKey;
        const label = /^[a-z0-9]$/i.test(section) ? `${gradeLabel}${section.toUpperCase()}` : [gradeLabel, section].filter(Boolean).join(' ');
        addCourseOption({
          value: label,
          label,
          gradeKey,
          section,
          source: 'campus',
        });
      });
    }
    const courseOptions = Array.from(courseOptionMap.values())
      .sort((left, right) => left.label.localeCompare(right.label, 'es', { numeric: true }));
    const courseKeys = courseOptions.map((course) => course.value);
    const feeSettings = serializeAcademicFeeConfigurationForStructure(
      await ensureAcademicFeeConfiguration(schoolId, feeSettingGrades),
      visibleAcademicStructure.grades,
    );

    return res.status(200).json({
      parents: isAdmissionsUser ? [] : parents,
      students: isAdmissionsUser ? [] : visibleStudents,
      communications: isBillingUser || isAdmissionsUser ? [] : communications.map(serializeCommunicationForDashboard),
      communicationAuthors: isBillingUser || isAdmissionsUser ? [] : communicationAuthors.map(serializeCommunicationAuthor),
      grades,
      courses: courseKeys,
      courseOptions,
      campusCourses: isAdmissionsUser ? [] : visibleCampusCourses.map((course) => ({
        key: normalizeText(course.title || course.section),
        label: normalizeText(course.title || course.section),
        gradeKey: normalizeText(course.studentGradeKey || course.gradeLevel),
        subject: normalizeText(course.subject),
        section: normalizeText(course.section),
        academicContent: Array.isArray(course.academicContent) ? course.academicContent.map((period) => ({
          periodKey: normalizeText(period.periodKey),
          periodName: normalizeText(period.periodName),
          startDate: normalizeText(period.startDate),
          endDate: normalizeText(period.endDate),
          order: Number(period.order || 0),
          topics: Array.isArray(period.topics) ? period.topics.map((topic) => ({
            key: normalizeText(topic.key),
            title: normalizeText(topic.title),
            description: normalizeText(topic.description),
            order: Number(topic.order || 0),
          })) : [],
        })) : [],
      })).filter((course) => course.key),
      billing: isCoordinationUser || isAdmissionsUser ? createEmptyBillingSummary() : billing,
      communicationRequests: isBillingUser || isAdmissionsUser ? [] : requestSummary.items,
      communicationRequestCounts: isBillingUser || isAdmissionsUser ? createEmptyCommunicationRequestSummary().counts : requestSummary.counts,
      calendarAssignments: isBillingUser || isAdmissionsUser ? [] : visibleCalendarAssignments.map(serializeAcademicCalendarAssignment),
      feeSettings,
      academicDatabase: isBillingUser ? [] : visibleAcademicDatabase,
      academicStructure: visibleAcademicStructure,
    });
  } catch (error) {
    console.error('[academic-management weekly schedule] save failed:', error);
    return res.status(500).json({ message: error.message });
  }
});

router.get('/academic-management/assignments', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const items = await AcademicCalendarAssignment.find({ schoolId, status: 'published' })
      .sort({ scheduledAt: 1, createdAt: -1 })
      .limit(120)
      .lean();

    return res.status(200).json({ items: items.map(serializeAcademicCalendarAssignment) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/academic-management/assignments', async (req, res) => {
  try {
    const { schoolId, userId, role } = req.user;
    const payload = normalizeAcademicCalendarAssignmentPayload(req.body);

    if (!payload.title) {
      return res.status(400).json({ message: 'El título de la asignación es obligatorio.' });
    }

    if (!payload.scheduledAt || Number.isNaN(payload.scheduledAt.getTime())) {
      return res.status(400).json({ message: 'Selecciona una fecha válida para la asignación.' });
    }

    if (payload.scope === 'grades' && payload.targetGradeKeys.length === 0) {
      return res.status(400).json({ message: 'Selecciona al menos un grado o publica para todo el colegio.' });
    }

    const currentUser = await User.findOne({ _id: userId, schoolId, deletedAt: null }).select('name role').lean();
    const item = await AcademicCalendarAssignment.create({
      schoolId,
      createdByUserId: String(userId),
      authorName: normalizeText(currentUser?.name) || 'Equipo académico',
      authorRole: normalizeText(currentUser?.role || role),
      title: payload.title,
      body: payload.body,
      type: payload.type,
      scheduledAt: payload.scheduledAt,
      scope: payload.scope,
      targetGradeKeys: payload.targetGradeKeys,
      status: 'published',
    });

    dispatchAcademicCalendarAssignmentNotification({ schoolId, assignment: item })
      .catch((error) => console.warn(`[ACADEMIC_ASSIGNMENT_NOTIFY_WARNING] assignment=${item._id} error=${error.message}`));

    return res.status(201).json({ item: serializeAcademicCalendarAssignment(item.toObject()) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.patch('/academic-management/assignments/:assignmentId/archive', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const assignmentId = normalizeText(req.params.assignmentId);

    if (!mongoose.Types.ObjectId.isValid(assignmentId)) {
      return res.status(400).json({ message: 'Asignación inválida.' });
    }

    const item = await AcademicCalendarAssignment.findOneAndUpdate(
      { _id: assignmentId, schoolId },
      { $set: { status: 'archived' } },
      { new: true }
    ).lean();

    if (!item) {
      return res.status(404).json({ message: 'Asignación no encontrada.' });
    }

    return res.status(200).json({ item: serializeAcademicCalendarAssignment(item) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/academic-management/grades', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const rawGradeLabel = normalizeText(req.body?.grade || req.body?.label || req.body?.key);
    const gradeKey = normalizeAcademicStructureGradeKey(rawGradeLabel);
    const levelKey = normalizeAcademicStructureLevelKey(req.body?.levelKey || req.body?.level);

    if (!gradeKey) {
      return res.status(400).json({ message: 'Debes indicar un grado valido.' });
    }

    if (!levelKey) {
      return res.status(400).json({ message: 'Debes seleccionar un nivel educativo.' });
    }

    const configuration = await ensureAcademicStructureConfiguration(schoolId);
    const serialized = serializeAcademicStructureConfiguration(configuration);
    const level = serialized.levels.find((item) => item.key === levelKey);
    const existingGrade = serialized.grades.find((grade) => grade.key === gradeKey);

    if (!level) {
      return res.status(404).json({ message: 'El nivel educativo seleccionado no existe.' });
    }

    if (existingGrade) {
      const currentGrades = Array.isArray(configuration.grades) ? configuration.grades : [];
      const nextGrades = currentGrades.map((grade) => {
        const currentGradeKey = normalizeAcademicStructureGradeKey(grade?.key || grade?.label);
        if (currentGradeKey !== gradeKey) {
          return grade;
        }

        return {
          ...grade,
          label: rawGradeLabel,
          levelKey,
        };
      });

      configuration.grades = nextGrades;
      await configuration.save();
      return res.status(200).json({ academicStructure: serializeAcademicStructureConfiguration(configuration) });
    }

    configuration.grades = [
      ...(Array.isArray(configuration.grades) ? configuration.grades : []),
      {
        key: gradeKey,
        label: rawGradeLabel,
        levelKey,
        order: ((Array.isArray(configuration.grades) ? configuration.grades.length : 0) + 1) * 10,
        status: 'active',
        courses: [],
      },
    ];
    await configuration.save();

    return res.status(201).json({ academicStructure: serializeAcademicStructureConfiguration(configuration) });
  } catch (error) {
    console.error('[academic-management weekly schedule] save failed:', error);
    return res.status(500).json({ message: error.message });
  }
});

router.post('/academic-management/levels', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const levelLabel = normalizeText(req.body?.level || req.body?.label || req.body?.name);
    const levelKey = normalizeAcademicStructureLevelKey(req.body?.key || levelLabel);

    if (!levelKey || !levelLabel) {
      return res.status(400).json({ message: 'Debes indicar un nivel educativo valido.' });
    }

    const configuration = await ensureAcademicStructureConfiguration(schoolId);
    const serialized = serializeAcademicStructureConfiguration(configuration);
    const existingLevel = serialized.levels.find((item) => item.key === levelKey);

    if (existingLevel) {
      return res.status(200).json({ academicStructure: serialized });
    }

    configuration.levels = [
      ...(Array.isArray(configuration.levels) ? configuration.levels : []),
      {
        key: levelKey,
        label: levelLabel,
        order: ((Array.isArray(configuration.levels) ? configuration.levels.length : 0) + 1) * 10,
        status: 'active',
      },
    ];
    await configuration.save();

    return res.status(201).json({ academicStructure: serializeAcademicStructureConfiguration(configuration) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.patch('/academic-management/levels/:levelKey', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const levelKey = normalizeAcademicStructureLevelKey(req.params?.levelKey);
    const levelLabel = normalizeText(req.body?.label || req.body?.level || req.body?.name);

    if (!levelKey) {
      return res.status(400).json({ message: 'Debes indicar un nivel educativo valido.' });
    }

    if (!levelLabel) {
      return res.status(400).json({ message: 'Debes indicar un nombre valido para el nivel educativo.' });
    }

    const configuration = await ensureAcademicStructureConfiguration(schoolId);
    const serialized = serializeAcademicStructureConfiguration(configuration);
    const existingLevel = serialized.levels.find((item) => item.key === levelKey);

    if (!existingLevel) {
      return res.status(404).json({ message: 'El nivel educativo indicado no existe.' });
    }

    configuration.levels = serialized.levels.map((item) => ({
      ...item,
      label: item.key === levelKey ? levelLabel : item.label,
      status: 'active',
    }));
    await configuration.save();

    return res.status(200).json({ academicStructure: serializeAcademicStructureConfiguration(configuration) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.patch('/academic-management/grades/:gradeKey/level', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const gradeKey = normalizeAcademicStructureGradeKey(req.params?.gradeKey);
    const levelKey = normalizeAcademicStructureLevelKey(req.body?.levelKey || req.body?.level);

    if (!gradeKey) {
      return res.status(400).json({ message: 'Debes indicar un grado valido.' });
    }

    if (!levelKey) {
      return res.status(400).json({ message: 'Debes seleccionar un nivel educativo.' });
    }

    const configuration = await ensureAcademicStructureConfiguration(schoolId);
    const serialized = serializeAcademicStructureConfiguration(configuration);
    const targetLevel = serialized.levels.find((item) => item.key === levelKey);
    const existingGrade = serialized.grades.find((grade) => grade.key === gradeKey);

    if (!targetLevel) {
      return res.status(404).json({ message: 'El nivel educativo seleccionado no existe.' });
    }

    if (!existingGrade) {
      return res.status(404).json({ message: 'El grado indicado no existe.' });
    }

    configuration.grades = serialized.grades.map((grade) => ({
      ...grade,
      levelKey: grade.key === gradeKey ? levelKey : grade.levelKey,
      status: 'active',
      courses: grade.courses.map((course) => ({ ...course, status: 'active' })),
    }));
    await configuration.save();

    return res.status(200).json({ academicStructure: serializeAcademicStructureConfiguration(configuration) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.patch('/academic-management/grades/:gradeKey', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const gradeKey = normalizeAcademicStructureGradeKey(req.params?.gradeKey);
    const gradeLabel = normalizeText(req.body?.label || req.body?.grade || req.body?.name);

    if (!gradeKey) {
      return res.status(400).json({ message: 'Debes indicar un grado valido.' });
    }

    if (!gradeLabel) {
      return res.status(400).json({ message: 'Debes indicar un nombre valido para el grado.' });
    }

    const configuration = await ensureAcademicStructureConfiguration(schoolId);
    const serialized = serializeAcademicStructureConfiguration(configuration);
    const existingGrade = serialized.grades.find((grade) => grade.key === gradeKey);

    if (!existingGrade) {
      return res.status(404).json({ message: 'El grado indicado no existe.' });
    }

    configuration.grades = serialized.grades.map((grade) => ({
      ...grade,
      label: grade.key === gradeKey ? gradeLabel : grade.label,
      status: 'active',
      courses: grade.courses.map((course) => ({ ...course, status: 'active' })),
    }));
    await configuration.save();

    return res.status(200).json({ academicStructure: serializeAcademicStructureConfiguration(configuration) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.delete('/academic-management/levels/:levelKey', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const levelKey = normalizeAcademicStructureLevelKey(req.params?.levelKey);

    if (!levelKey) {
      return res.status(400).json({ message: 'Debes indicar un nivel educativo valido.' });
    }

    const passwordCheck = await ensureCurrentUserPassword(req, req.body?.password);
    if (!passwordCheck.ok) {
      return res.status(passwordCheck.status).json({ message: passwordCheck.message });
    }

    const configuration = await ensureAcademicStructureConfiguration(schoolId);
    const serialized = serializeAcademicStructureConfiguration(configuration);
    const level = serialized.levels.find((item) => item.key === levelKey);

    if (!level) {
      return res.status(404).json({ message: 'El nivel educativo indicado no existe.' });
    }

    configuration.levels = serialized.levels
      .filter((item) => item.key !== levelKey)
      .map((item, index) => ({
        ...item,
        order: (index + 1) * 10,
        status: 'active',
      }));

    configuration.grades = serialized.grades.map((grade, index) => ({
      ...grade,
      levelKey: grade.levelKey === levelKey ? '' : grade.levelKey,
      order: (index + 1) * 10,
      status: 'active',
      courses: grade.courses.map((course, courseIndex) => ({
        ...course,
        order: (courseIndex + 1) * 10,
        status: 'active',
      })),
    }));
    await configuration.save();

    return res.status(200).json({ academicStructure: serializeAcademicStructureConfiguration(configuration) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/academic-management/subjects', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const subjectLabel = normalizeText(req.body?.subject || req.body?.label || req.body?.name);
    const subjectKey = slugifyAcademicStructureKey(req.body?.key || subjectLabel);
    const subjectKind = normalizeAcademicStructureSubjectKind(req.body?.kind || req.body?.type);

    if (!subjectKey || !subjectLabel) {
      return res.status(400).json({ message: 'Debes indicar un nombre valido para la asignatura.' });
    }

    const configuration = await ensureAcademicStructureConfiguration(schoolId);
    const serialized = serializeAcademicStructureConfiguration(configuration);
    const existingSubject = serialized.subjects.find((item) => item.key === subjectKey);

    if (existingSubject) {
      return res.status(200).json({ academicStructure: serialized });
    }

    configuration.subjects = [
      ...(Array.isArray(configuration.subjects) ? configuration.subjects : []),
      {
        key: subjectKey,
        label: subjectLabel,
        kind: subjectKind,
        gradeKeys: [],
        order: ((Array.isArray(configuration.subjects) ? configuration.subjects.length : 0) + 1) * 10,
        status: 'active',
      },
    ];
    await configuration.save();

    return res.status(201).json({ academicStructure: serializeAcademicStructureConfiguration(configuration) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.patch('/academic-management/subjects/:subjectKey', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const subjectKey = slugifyAcademicStructureKey(req.params?.subjectKey);
    const subjectLabel = normalizeText(req.body?.label || req.body?.subject || req.body?.name);
    const subjectKind = normalizeAcademicStructureSubjectKind(req.body?.kind || req.body?.type);

    if (!subjectKey) {
      return res.status(400).json({ message: 'Debes indicar una asignatura valida.' });
    }

    if (!subjectLabel) {
      return res.status(400).json({ message: 'Debes indicar un nombre valido para la asignatura.' });
    }

    const configuration = await ensureAcademicStructureConfiguration(schoolId);
    const serialized = serializeAcademicStructureConfiguration(configuration);
    const subject = serialized.subjects.find((item) => item.key === subjectKey);

    if (!subject) {
      return res.status(404).json({ message: 'La asignatura indicada no existe.' });
    }

    configuration.subjects = serialized.subjects.map((item) => ({
      ...item,
      label: item.key === subjectKey ? subjectLabel : item.label,
      kind: item.key === subjectKey ? subjectKind : item.kind,
      status: 'active',
    }));
    await configuration.save();

    return res.status(200).json({ academicStructure: serializeAcademicStructureConfiguration(configuration) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.put('/academic-management/subjects/:subjectKey/grades', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const subjectKey = slugifyAcademicStructureKey(req.params?.subjectKey);
    const requestedGradeKeys = Array.isArray(req.body?.gradeKeys) ? req.body.gradeKeys : [];

    if (!subjectKey) {
      return res.status(400).json({ message: 'Debes indicar una asignatura valida.' });
    }

    const configuration = await ensureAcademicStructureConfiguration(schoolId);
    const serialized = serializeAcademicStructureConfiguration(configuration);
    const subject = serialized.subjects.find((item) => item.key === subjectKey);

    if (!subject) {
      return res.status(404).json({ message: 'La asignatura indicada no existe.' });
    }

    const validGradeKeys = new Set(serialized.grades.map((grade) => grade.key));
    const normalizedGradeKeys = uniqueNormalizedValues(requestedGradeKeys)
      .map((gradeKey) => normalizeAcademicStructureGradeKey(gradeKey))
      .filter((gradeKey) => validGradeKeys.has(gradeKey));

    configuration.subjects = serialized.subjects.map((item) => ({
      ...item,
      gradeKeys: item.key === subjectKey ? normalizedGradeKeys : item.gradeKeys,
      status: 'active',
    }));
    await configuration.save();

    return res.status(200).json({ academicStructure: serializeAcademicStructureConfiguration(configuration) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.delete('/academic-management/subjects/:subjectKey', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const subjectKey = slugifyAcademicStructureKey(req.params?.subjectKey);

    if (!subjectKey) {
      return res.status(400).json({ message: 'Debes indicar una asignatura valida.' });
    }

    const passwordCheck = await ensureCurrentUserPassword(req, req.body?.password);
    if (!passwordCheck.ok) {
      return res.status(passwordCheck.status).json({ message: passwordCheck.message });
    }

    const configuration = await ensureAcademicStructureConfiguration(schoolId);
    const serialized = serializeAcademicStructureConfiguration(configuration);
    const subject = serialized.subjects.find((item) => item.key === subjectKey);

    if (!subject) {
      return res.status(404).json({ message: 'La asignatura indicada no existe.' });
    }

    configuration.subjects = serialized.subjects
      .filter((item) => item.key !== subjectKey)
      .map((item, index) => ({
        ...item,
        order: (index + 1) * 10,
        status: 'active',
      }));
    await configuration.save();

    return res.status(200).json({ academicStructure: serializeAcademicStructureConfiguration(configuration) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/academic-management/courses', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const gradeKey = normalizeAcademicStructureGradeKey(req.body?.grade);
    const rawCourseLabel = normalizeText(req.body?.courseKey || req.body?.label || req.body?.name || req.body?.key);
    const rawSection = normalizeText(req.body?.section || rawCourseLabel);
    const normalizedCourseSlug = slugifyAcademicStructureKey(rawCourseLabel || rawSection);
    const courseKey = gradeKey && normalizedCourseSlug ? `${gradeKey}:${normalizedCourseSlug}` : '';
    const courseLabel = rawCourseLabel || rawSection;

    if (!gradeKey) {
      return res.status(400).json({ message: 'Debes seleccionar un grado valido.' });
    }

    if (!courseKey || !courseLabel) {
      return res.status(400).json({ message: 'Debes indicar un curso valido.' });
    }

    const configuration = await ensureAcademicStructureConfiguration(schoolId);
    const serialized = serializeAcademicStructureConfiguration(configuration);
    const grade = serialized.grades.find((item) => item.key === gradeKey);

    if (!grade) {
      return res.status(404).json({ message: 'Primero crea el grado antes de registrar cursos.' });
    }

    if (grade.courses.some((course) => course.key === courseKey)) {
      configuration.grades = serialized.grades.map((item) => {
        if (item.key !== gradeKey) {
          return {
            ...item,
            levelKey: item.levelKey,
            status: 'active',
            courses: item.courses.map((course) => ({ ...course, status: 'active' })),
          };
        }

        return {
          ...item,
          levelKey: item.levelKey,
          status: 'active',
          courses: item.courses.map((course) => ({
            ...course,
            label: course.key === courseKey ? courseLabel : course.label,
            status: 'active',
          })),
        };
      });
      await configuration.save();
      return res.status(200).json({ academicStructure: serializeAcademicStructureConfiguration(configuration) });
    }

    configuration.grades = serialized.grades.map((item) => {
      if (item.key !== gradeKey) {
        return {
          ...item,
          levelKey: item.levelKey,
          status: 'active',
          courses: item.courses.map((course) => ({ ...course, status: 'active' })),
        };
      }

      return {
        ...item,
        levelKey: item.levelKey,
        status: 'active',
        courses: [
          ...item.courses.map((course) => ({ ...course, status: 'active' })),
          {
            key: courseKey,
            label: courseLabel,
            section: rawSection || courseLabel,
            order: (item.courses.length + 1) * 10,
            status: 'active',
          },
        ],
      };
    });
    await configuration.save();

    return res.status(201).json({ academicStructure: serializeAcademicStructureConfiguration(configuration) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.patch('/academic-management/courses/:courseKey', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const courseKey = normalizeText(req.params?.courseKey);
    const courseLabel = normalizeText(req.body?.label || req.body?.course || req.body?.name);

    if (!courseKey) {
      return res.status(400).json({ message: 'Debes indicar un curso valido.' });
    }

    if (!courseLabel) {
      return res.status(400).json({ message: 'Debes indicar un nombre valido para el curso.' });
    }

    const configuration = await ensureAcademicStructureConfiguration(schoolId);
    const serialized = serializeAcademicStructureConfiguration(configuration);
    const grade = serialized.grades.find((item) => item.courses.some((course) => course.key === courseKey));

    if (!grade) {
      return res.status(404).json({ message: 'El curso indicado no existe.' });
    }

    configuration.grades = serialized.grades.map((item) => {
      if (item.key !== grade.key) {
        return {
          ...item,
          levelKey: item.levelKey,
          status: 'active',
          courses: item.courses.map((course, courseIndex) => ({
            ...course,
            order: (courseIndex + 1) * 10,
            status: 'active',
          })),
        };
      }

      return {
        ...item,
        levelKey: item.levelKey,
        status: 'active',
        courses: item.courses.map((course, courseIndex) => ({
          ...course,
          label: course.key === courseKey ? courseLabel : course.label,
          order: (courseIndex + 1) * 10,
          status: 'active',
        })),
      };
    });
    await configuration.save();

    return res.status(200).json({ academicStructure: serializeAcademicStructureConfiguration(configuration) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.patch('/academic-management/courses/:courseKey/headroom-teacher', async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const courseKey = normalizeText(req.params?.courseKey).toUpperCase();
    const teacherUserId = normalizeText(req.body?.teacherUserId);

    if (!courseKey) {
      return res.status(400).json({ message: 'Debes indicar un curso valido.' });
    }

    const configuration = await ensureAcademicStructureConfiguration(schoolId);
    const serialized = serializeAcademicStructureConfiguration(configuration);
    const grade = serialized.grades.find((item) => item.courses.some((course) => course.key === courseKey));
    const targetCourse = grade?.courses?.find((course) => course.key === courseKey) || null;

    if (!grade || !targetCourse) {
      return res.status(404).json({ message: 'El curso indicado no existe.' });
    }

    let teacher = null;
    if (teacherUserId) {
      if (!mongoose.Types.ObjectId.isValid(teacherUserId)) {
        return res.status(400).json({ message: 'Selecciona un docente valido.' });
      }

      teacher = await User.findOne({ schoolId, _id: teacherUserId, role: 'teacher', status: 'active', deletedAt: null }).select('_id name username').lean();
      if (!teacher) {
        return res.status(404).json({ message: 'Docente no encontrado.' });
      }
    }

    configuration.grades = serialized.grades.map((item) => ({
      ...item,
      levelKey: item.levelKey,
      status: 'active',
      courses: item.courses.map((course, courseIndex) => ({
        ...course,
        headroomTeacherUserId: course.key === courseKey ? (teacherUserId || null) : (course.headroomTeacherUserId || null),
        order: Number(course.order || (courseIndex + 1) * 10),
        status: 'active',
      })),
    }));

    await configuration.save();

    await CampusCourse.updateMany(
      { schoolId, courseType: 'guidance_routine', sourceCourseKey: courseKey, status: 'active' },
      { $set: { status: 'archived' } }
    );

    if (teacherUserId) {
      const title = `Guidance Routine · ${targetCourse.label || targetCourse.section || grade.label}`;
      await CampusCourse.findOneAndUpdate(
        { schoolId, courseType: 'guidance_routine', sourceCourseKey: courseKey, teacherUserId },
        {
          $set: {
            schoolId,
            teacherUserId,
            assignedByUserId: normalizeText(userId),
            courseType: 'guidance_routine',
            sourceCourseKey: courseKey,
            title,
            subject: 'Guidance Routine',
            gradeLevel: normalizeText(grade.label || grade.key),
            section: normalizeText(targetCourse.label || targetCourse.section),
            studentGradeKey: normalizeText(grade.key),
            description: 'Curso de guidance routine sincronizado desde Rectoría.',
            classSessions: [],
            status: 'active',
          },
          $setOnInsert: {
            academicPeriods: [],
            gradingComponents: [],
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    return res.status(200).json({ academicStructure: serializeAcademicStructureConfiguration(configuration) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.delete('/academic-management/grades/:gradeKey', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const gradeKey = normalizeAcademicStructureGradeKey(req.params?.gradeKey);

    if (!gradeKey) {
      return res.status(400).json({ message: 'Debes indicar un grado valido.' });
    }

    const passwordCheck = await ensureCurrentUserPassword(req, req.body?.password);
    if (!passwordCheck.ok) {
      return res.status(passwordCheck.status).json({ message: passwordCheck.message });
    }

    const configuration = await ensureAcademicStructureConfiguration(schoolId);
    const serialized = serializeAcademicStructureConfiguration(configuration);
    const grade = serialized.grades.find((item) => item.key === gradeKey);

    if (!grade) {
      return res.status(404).json({ message: 'El grado indicado no existe.' });
    }

    const courseKeys = grade.courses.map((course) => course.key).filter(Boolean);
    await CampusCourse.updateMany(
      {
        schoolId,
        status: 'active',
        $or: [
          { gradeLevel: gradeKey },
          ...(courseKeys.length ? [{ studentGradeKey: { $in: courseKeys } }] : []),
        ],
      },
      { $set: { status: 'archived' } }
    );

    const studentFilter = {
      schoolId,
      deletedAt: null,
      $or: [
        { grade: gradeKey },
        ...(courseKeys.length ? [{ course: { $in: courseKeys } }] : []),
      ],
    };
    await Student.updateMany(studentFilter, { $set: { course: '' } });

    configuration.grades = serialized.grades
      .filter((item) => item.key !== gradeKey)
      .map((item, index) => ({
        ...item,
        levelKey: item.levelKey,
        order: (index + 1) * 10,
        status: 'active',
        courses: item.courses.map((course, courseIndex) => ({
          ...course,
          order: (courseIndex + 1) * 10,
          status: 'active',
        })),
      }));
    configuration.subjects = serialized.subjects.map((subject, index) => ({
      ...subject,
      gradeKeys: (Array.isArray(subject.gradeKeys) ? subject.gradeKeys : []).filter((item) => item !== gradeKey),
      order: (index + 1) * 10,
      status: 'active',
    }));
    await configuration.save();

      return res.status(200).json({
        academicStructure: serializeAcademicStructureConfiguration(configuration),
        clearedStudentGrade: gradeKey,
        clearedCourseKeys: courseKeys,
      });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.delete('/academic-management/courses/:courseKey', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const courseKey = normalizeText(req.params?.courseKey);

    if (!courseKey) {
      return res.status(400).json({ message: 'Debes indicar un curso valido.' });
    }

    const passwordCheck = await ensureCurrentUserPassword(req, req.body?.password);
    if (!passwordCheck.ok) {
      return res.status(passwordCheck.status).json({ message: passwordCheck.message });
    }

    const configuration = await ensureAcademicStructureConfiguration(schoolId);
    const serialized = serializeAcademicStructureConfiguration(configuration);
    const grade = serialized.grades.find((item) => item.courses.some((course) => course.key === courseKey));

    if (!grade) {
      return res.status(404).json({ message: 'El curso indicado no existe.' });
    }

    await CampusCourse.updateMany(
      { schoolId, status: 'active', studentGradeKey: courseKey },
      { $set: { status: 'archived' } }
    );

    await Student.updateMany({ schoolId, deletedAt: null, course: courseKey }, { $set: { course: '' } });

    configuration.grades = serialized.grades.map((item) => {
      if (item.key !== grade.key) {
        return {
          ...item,
          levelKey: item.levelKey,
          status: 'active',
          courses: item.courses.map((course, courseIndex) => ({
            ...course,
            order: (courseIndex + 1) * 10,
            status: 'active',
          })),
        };
      }

      const nextCourses = item.courses
        .filter((course) => course.key !== courseKey)
        .map((course, courseIndex) => ({
          ...course,
          order: (courseIndex + 1) * 10,
          status: 'active',
        }));

      return {
        ...item,
        levelKey: item.levelKey,
        status: 'active',
        courses: nextCourses,
      };
    });
    await configuration.save();

    return res.status(200).json({
      academicStructure: serializeAcademicStructureConfiguration(configuration),
      clearedCourseKeys: [courseKey],
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.put('/academic-management/periods', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const normalizedPeriodsResult = normalizeAcademicPeriodsConfiguration(req.body?.periods);
    const gradingScaleResult = normalizeAcademicGradingScale(req.body?.gradingScale || {});

    if (!normalizedPeriodsResult.ok) {
      return res.status(400).json({ message: normalizedPeriodsResult.message });
    }

    if (!gradingScaleResult.ok) {
      return res.status(400).json({ message: gradingScaleResult.message });
    }

    const configuration = await ensureAcademicStructureConfiguration(schoolId);
    const activeLevels = (Array.isArray(configuration.levels) ? configuration.levels : [])
      .filter((level) => normalizeText(level?.status || 'active') !== 'archived');
    const gradingScalesByLevelResult = normalizeAcademicGradingScalesByLevel(req.body?.gradingScalesByLevel || [], { levels: activeLevels });
    if (!gradingScalesByLevelResult.ok) {
      return res.status(400).json({ message: gradingScalesByLevelResult.message });
    }

    configuration.academicYear = normalizeText(req.body?.academicYear) || normalizeText(configuration.academicYear) || getCurrentAcademicYear();
    configuration.academicPeriods = normalizedPeriodsResult.periods;
    configuration.gradingScale = gradingScaleResult.gradingScale;
    configuration.gradingScalesByLevel = gradingScalesByLevelResult.gradingScalesByLevel;
    await configuration.save();

    return res.status(200).json({ academicStructure: serializeAcademicStructureConfiguration(configuration) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.put('/academic-management/schedule-breaks', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const configuration = await ensureAcademicStructureConfiguration(schoolId);
    const allowedGradeKeys = new Set((Array.isArray(configuration?.grades) ? configuration.grades : []).map((grade) => normalizeAcademicStructureGradeKey(grade?.key || grade?.label)).filter(Boolean));
    const normalizedBreaks = normalizeAcademicScheduleBreaks(req.body?.breaks, { allowedGradeKeys, scheduleSettings: configuration.scheduleSettings });

    if (!normalizedBreaks.ok) {
      return res.status(400).json({ message: normalizedBreaks.message });
    }

    configuration.scheduleBreaks = normalizedBreaks.breaks;
    applyAcademicScheduleBreaksToConfiguration(configuration);
    await configuration.save();

    return res.status(200).json({ academicStructure: serializeAcademicStructureConfiguration(configuration) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.put('/academic-management/schedule-settings', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const configuration = await ensureAcademicStructureConfiguration(schoolId);
    const allowedGradeKeys = new Set((Array.isArray(configuration?.grades) ? configuration.grades : []).map((grade) => normalizeAcademicStructureGradeKey(grade?.key || grade?.label)).filter(Boolean));
    const normalizedSettings = normalizeAcademicScheduleSettings(req.body, { allowedGradeKeys });
    if (!normalizedSettings.ok) {
      return res.status(400).json({ message: normalizedSettings.message });
    }

    configuration.scheduleSettings = normalizedSettings.scheduleSettings;
    applyAcademicScheduleBreaksToConfiguration(configuration);
    await configuration.save();

    return res.status(200).json({ academicStructure: serializeAcademicStructureConfiguration(configuration) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.put('/academic-management/teaching-availability', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const configuration = await ensureAcademicStructureConfiguration(schoolId);
    const serialized = serializeAcademicStructureConfiguration(configuration);
    const allowedGradeKeys = new Set(serialized.grades.map((grade) => grade.key));
    const allowedSubjectKeys = new Set(serialized.subjects.map((subject) => subject.key));
    const subjectGradeMap = new Map(serialized.subjects.map((subject) => [subject.key, new Set(Array.isArray(subject.gradeKeys) ? subject.gradeKeys : [])]));
    const teacherIds = uniqueNormalizedValues((Array.isArray(req.body?.teachingAvailability) ? req.body.teachingAvailability : []).map((item) => item?.teacherUserId)).filter((value) => mongoose.Types.ObjectId.isValid(value));
    const teachers = teacherIds.length > 0
      ? await User.find({ schoolId, _id: { $in: teacherIds }, role: 'teacher', status: 'active', deletedAt: null }).select('_id').lean()
      : [];

    const normalizedAvailability = normalizeAcademicTeachingAvailability(req.body?.teachingAvailability, {
      allowedSubjectKeys,
      teacherIds: new Set(teachers.map((teacher) => String(teacher._id))),
      allowedGradeKeys,
      subjectGradeMap,
    });

    if (!normalizedAvailability.ok) {
      return res.status(400).json({ message: normalizedAvailability.message });
    }

    configuration.teachingAvailability = normalizedAvailability.teachingAvailability;
    await configuration.save();

    return res.status(200).json({ academicStructure: serializeAcademicStructureConfiguration(configuration) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.put('/academic-management/subject-load-templates', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const configuration = await ensureAcademicStructureConfiguration(schoolId);
    const serialized = serializeAcademicStructureConfiguration(configuration);
    const allowedGradeKeys = new Set(serialized.grades.map((grade) => grade.key));
    const allowedSubjectKeys = new Set(serialized.subjects.map((subject) => subject.key));
    const subjectGradeMap = new Map(serialized.subjects.map((subject) => [subject.key, new Set(Array.isArray(subject.gradeKeys) ? subject.gradeKeys : [])]));
    const teacherIds = uniqueNormalizedValues((Array.isArray(req.body?.subjectLoadTemplates) ? req.body.subjectLoadTemplates : []).map((item) => item?.teacherUserId)).filter((value) => mongoose.Types.ObjectId.isValid(value));
    const teachers = teacherIds.length > 0
      ? await User.find({ schoolId, _id: { $in: teacherIds }, role: 'teacher', status: 'active', deletedAt: null }).select('_id').lean()
      : [];

    const normalizedTemplates = normalizeAcademicSubjectLoadTemplates(req.body?.subjectLoadTemplates, {
      allowedSubjectKeys,
      teacherIds: new Set(teachers.map((teacher) => String(teacher._id))),
      allowedGradeKeys,
      subjectGradeMap,
    });

    if (!normalizedTemplates.ok) {
      return res.status(400).json({ message: normalizedTemplates.message });
    }

    configuration.subjectLoadTemplates = normalizedTemplates.subjectLoadTemplates;
    syncAcademicGradeSchedulesFromTemplates(configuration);
    applyAcademicScheduleBreaksToConfiguration(configuration);
    await configuration.save();

    return res.status(200).json({ academicStructure: serializeAcademicStructureConfiguration(configuration) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.put('/academic-management/schedules/:gradeKey/load', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const gradeKey = normalizeAcademicStructureGradeKey(req.params.gradeKey);
    const courseKey = normalizeText(req.body?.courseKey);
    if (!gradeKey) {
      return res.status(400).json({ message: 'Grado invalido.' });
    }

    const configuration = await ensureAcademicStructureConfiguration(schoolId);
    const serialized = serializeAcademicStructureConfiguration(configuration);
    const grade = serialized.grades.find((item) => item.key === gradeKey);
    if (!grade) {
      return res.status(404).json({ message: 'No se encontró el grado solicitado.' });
    }
    if (courseKey && !grade.courses.some((course) => course.key === courseKey)) {
      return res.status(404).json({ message: 'No se encontró el curso solicitado para este grado.' });
    }

    const allowedSubjects = serialized.subjects.filter((subject) => Array.isArray(subject.gradeKeys) && subject.gradeKeys.includes(gradeKey));
    const teacherIds = uniqueNormalizedValues((Array.isArray(req.body?.subjectLoads) ? req.body.subjectLoads : []).map((item) => item?.teacherUserId)).filter((value) => mongoose.Types.ObjectId.isValid(value));
    const teachers = teacherIds.length > 0
      ? await User.find({ schoolId, _id: { $in: teacherIds }, role: 'teacher', status: 'active', deletedAt: null }).select('_id').lean()
      : [];

    const normalizedLoads = normalizeAcademicScheduleSubjectLoads(req.body?.subjectLoads, {
      allowedSubjectKeys: new Set(allowedSubjects.map((subject) => subject.key)),
      teacherIds: new Set(teachers.map((teacher) => String(teacher._id))),
    });

    if (!normalizedLoads.ok) {
      return res.status(400).json({ message: normalizedLoads.message });
    }

    const gradeSchedule = ensureAcademicGradeSchedule(configuration, gradeKey, { courseKey });
    const allowedGradeKeys = new Set(serialized.grades.map((item) => item.key));
    gradeSchedule.subjectLoads = normalizedLoads.subjectLoads;
    const breakSlotMap = buildAcademicBreakSlotIndex(configuration.scheduleBreaks, gradeKey, { scheduleSettings: configuration.scheduleSettings, allowedGradeKeys });

    const loadMap = new Map(normalizedLoads.subjectLoads.map((load) => [load.subjectKey, load]));
    const existingEntries = Array.isArray(gradeSchedule.weeklySchedule) && gradeSchedule.weeklySchedule.length > 0
      ? gradeSchedule.weeklySchedule
      : createDefaultAcademicScheduleTemplate(configuration.scheduleSettings, { gradeKey, allowedGradeKeys });
    gradeSchedule.weeklySchedule = existingEntries.map((entry) => {
      const subjectKey = slugifyAcademicStructureKey(entry?.subjectKey);
      if (!subjectKey || !loadMap.has(subjectKey)) {
        return {
          key: normalizeText(entry?.key) || buildAcademicScheduleSlotKey(entry?.weekday, entry?.block),
          weekday: Number(entry?.weekday || 0),
          block: Number(entry?.block || 0),
          startTime: normalizeAcademicScheduleTime(entry?.startTime),
          endTime: normalizeAcademicScheduleTime(entry?.endTime),
          entryType: breakSlotMap.has(buildAcademicScheduleSlotKey(entry?.weekday, entry?.block)) ? 'break' : 'class',
          subjectKey: '',
          breakKey: breakSlotMap.get(buildAcademicScheduleSlotKey(entry?.weekday, entry?.block))?.key || '',
          breakLabel: breakSlotMap.get(buildAcademicScheduleSlotKey(entry?.weekday, entry?.block))?.label || '',
          teacherUserId: null,
        };
      }

      return {
        key: normalizeText(entry?.key) || buildAcademicScheduleSlotKey(entry?.weekday, entry?.block),
        weekday: Number(entry?.weekday || 0),
        block: Number(entry?.block || 0),
        startTime: normalizeAcademicScheduleTime(entry?.startTime),
        endTime: normalizeAcademicScheduleTime(entry?.endTime),
        entryType: 'class',
        subjectKey,
        breakKey: '',
        breakLabel: '',
        teacherUserId: loadMap.get(subjectKey)?.teacherUserId || null,
      };
    });
    applyAcademicScheduleBreaksToConfiguration(configuration);
    gradeSchedule.updatedAt = new Date();
    await configuration.save();

    return res.status(200).json({ academicStructure: serializeAcademicStructureConfiguration(configuration) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.put('/academic-management/schedules/:gradeKey/weekly', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const gradeKey = normalizeAcademicStructureGradeKey(req.params.gradeKey);
    const courseKey = normalizeText(req.body?.courseKey);
    if (!gradeKey) {
      return res.status(400).json({ message: 'Grado invalido.' });
    }

    const configuration = await ensureAcademicStructureConfiguration(schoolId);
    const serialized = serializeAcademicStructureConfiguration(configuration);
    const grade = serialized.grades.find((item) => item.key === gradeKey);
    if (!grade) {
      return res.status(404).json({ message: 'No se encontró el grado solicitado.' });
    }
    if (courseKey && !grade.courses.some((course) => course.key === courseKey)) {
      return res.status(404).json({ message: 'No se encontró el curso solicitado para este grado.' });
    }

    const gradeSchedule = ensureAcademicGradeSchedule(configuration, gradeKey, { courseKey });
    const gradeLevelSchedule = ensureAcademicGradeSchedule(configuration, gradeKey);
    const allowedGradeKeys = new Set(serialized.grades.map((item) => item.key));
    const breakSlotMap = buildAcademicBreakSlotIndex(configuration.scheduleBreaks, gradeKey, { scheduleSettings: configuration.scheduleSettings, allowedGradeKeys });
    const scheduleSubjectLoads = Array.isArray(gradeSchedule.subjectLoads) && gradeSchedule.subjectLoads.length > 0
      ? gradeSchedule.subjectLoads
      : (Array.isArray(gradeLevelSchedule?.subjectLoads) && gradeLevelSchedule.subjectLoads.length > 0
        ? gradeLevelSchedule.subjectLoads
        : buildAcademicSubjectLoadsFromTemplates(configuration.subjectLoadTemplates, gradeKey));
    const loadMap = new Map((Array.isArray(scheduleSubjectLoads) ? scheduleSubjectLoads : []).map((load) => [slugifyAcademicStructureKey(load.subjectKey), {
      subjectKey: slugifyAcademicStructureKey(load.subjectKey),
      weeklyHours: Number(load.weeklyHours || 0),
      teacherUserId: load.teacherUserId ? String(load.teacherUserId) : null,
    }]));
    serialized.subjects
      .filter((subject) => Array.isArray(subject.gradeKeys) && subject.gradeKeys.includes(gradeKey))
      .forEach((subject) => {
        if (!loadMap.has(subject.key)) {
          loadMap.set(subject.key, { subjectKey: subject.key, weeklyHours: 0, teacherUserId: null });
        }
      });

    const normalizedWeeklySchedule = normalizeAcademicWeeklyScheduleEntries(req.body?.weeklySchedule, { subjectLoadMap: loadMap, breakSlotMap, scheduleSettings: configuration.scheduleSettings, gradeKey, allowedGradeKeys, teachingAvailability: configuration.teachingAvailability });
    if (!normalizedWeeklySchedule.ok) {
      return res.status(400).json({ message: normalizedWeeklySchedule.message });
    }

    const serializedWithCurrentSchedules = serializeAcademicStructureConfiguration(configuration);
    const subjectLabelByKey = new Map(serialized.subjects.map((subject) => [subject.key, subject.label || subject.key]));
    const gradeLabelByKey = new Map(serialized.grades.map((item) => [item.key, item.label || item.key]));
    const teacherIds = uniqueNormalizedValues(normalizedWeeklySchedule.weeklySchedule.map((entry) => entry.teacherUserId)).filter((value) => mongoose.Types.ObjectId.isValid(value));
    const teachers = teacherIds.length > 0
      ? await User.find({ schoolId, _id: { $in: teacherIds }, role: 'teacher', status: 'active', deletedAt: null }).select('_id name').lean()
      : [];
    const teacherNameById = new Map(teachers.map((teacher) => [String(teacher._id), teacher.name || 'Docente']));
    const teacherConflicts = buildTeacherConflictIndex(serializedWithCurrentSchedules.gradeSchedules, { skipGradeKey: `${gradeKey}::${courseKey}` });

    for (const entry of normalizedWeeklySchedule.weeklySchedule) {
      if (!entry.subjectKey || !entry.teacherUserId) {
        continue;
      }

      const conflict = teacherConflicts.get(`${entry.teacherUserId}::${buildAcademicScheduleSlotKey(entry.weekday, entry.block)}`);
      if (conflict) {
        return res.status(400).json({
          message: buildAcademicScheduleConflictMessage({
            teacherName: teacherNameById.get(String(entry.teacherUserId)) || 'El docente seleccionado',
            subjectLabel: subjectLabelByKey.get(entry.subjectKey) || entry.subjectKey,
            slot: entry,
            conflictingGradeLabel: conflict.courseKey ? `curso ${conflict.courseKey}` : `grado ${gradeLabelByKey.get(conflict.gradeKey) || conflict.gradeKey}`,
          }),
        });
      }
    }

    gradeSchedule.weeklySchedule = normalizedWeeklySchedule.weeklySchedule;
    applyAcademicScheduleBreaksToConfiguration(configuration);
    pruneEmptyDuplicateGradeSchedules(configuration);
    gradeSchedule.updatedAt = new Date();
    await configuration.save();

    return res.status(200).json({ academicStructure: serializeAcademicStructureConfiguration(configuration) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/academic-management/schedules/:gradeKey/generate', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const gradeKey = normalizeAcademicStructureGradeKey(req.params.gradeKey);
    if (!gradeKey) {
      return res.status(400).json({ message: 'Grado invalido.' });
    }

    const configuration = await ensureAcademicStructureConfiguration(schoolId);
    const serialized = serializeAcademicStructureConfiguration(configuration);
    const grade = serialized.grades.find((item) => item.key === gradeKey);
    if (!grade) {
      return res.status(404).json({ message: 'No se encontró el grado solicitado.' });
    }

    const gradeSchedule = ensureAcademicGradeSchedule(configuration, gradeKey);
    const allowedGradeKeys = new Set(serialized.grades.map((item) => item.key));
    const breakSlotMap = buildAcademicBreakSlotIndex(configuration.scheduleBreaks, gradeKey, { scheduleSettings: configuration.scheduleSettings, allowedGradeKeys });
    const loadMap = new Map((Array.isArray(gradeSchedule.subjectLoads) ? gradeSchedule.subjectLoads : []).map((load) => [slugifyAcademicStructureKey(load.subjectKey), {
      subjectKey: slugifyAcademicStructureKey(load.subjectKey),
      weeklyHours: Number(load.weeklyHours || 0),
      teacherUserId: load.teacherUserId ? String(load.teacherUserId) : null,
    }]));
    const slotTemplatesSource = Array.isArray(req.body?.slotTemplates) && req.body.slotTemplates.length > 0
      ? req.body.slotTemplates
      : (Array.isArray(gradeSchedule.weeklySchedule) && gradeSchedule.weeklySchedule.length > 0 ? gradeSchedule.weeklySchedule : createDefaultAcademicScheduleTemplate(configuration.scheduleSettings, { gradeKey, allowedGradeKeys }));
    const normalizedTemplates = normalizeAcademicWeeklyScheduleEntries(slotTemplatesSource, { subjectLoadMap: new Map(), breakSlotMap, scheduleSettings: configuration.scheduleSettings, gradeKey, allowedGradeKeys });
    if (!normalizedTemplates.ok) {
      return res.status(400).json({ message: normalizedTemplates.message });
    }

    const generationResult = generateAcademicWeeklySchedule({
      slotTemplates: normalizedTemplates.weeklySchedule.map((entry) => ({ ...entry, subjectKey: '', teacherUserId: null })),
      subjectLoads: Array.from(loadMap.values()).filter((load) => Number(load.weeklyHours || 0) > 0),
      conflictIndex: buildTeacherConflictIndex(serialized.gradeSchedules, { skipGradeKey: gradeKey }),
      teachingAvailability: configuration.teachingAvailability,
      gradeKey,
    });

    if (!generationResult.ok) {
      return res.status(400).json({ message: generationResult.message });
    }

    gradeSchedule.weeklySchedule = generationResult.weeklySchedule;
    applyAcademicScheduleBreaksToConfiguration(configuration);
    gradeSchedule.updatedAt = new Date();
    await configuration.save();

    return res.status(200).json({ academicStructure: serializeAcademicStructureConfiguration(configuration) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.patch('/academic-management/students/:studentId/course', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const isCoordinationUser = String(req.user?.role || '').trim() === 'coordination';
    const studentId = toObjectId(req.params.studentId);
    const courseKey = normalizeText(req.body?.course).toUpperCase().replace(/\s+/g, '');

    if (!studentId) {
      return res.status(400).json({ message: 'Alumno invalido.' });
    }

    if (!courseKey) {
      return res.status(400).json({ message: 'Debes seleccionar un curso para asignar.' });
    }

    const student = await Student.findOne({ _id: studentId, schoolId, deletedAt: null });
    if (!student) {
      return res.status(404).json({ message: 'No se encontró el alumno solicitado.' });
    }

    const studentGradeLevel = normalizeAcademicStructureGradeKey(student.grade);
    if (!studentGradeLevel) {
      return res.status(400).json({ message: 'El alumno debe tener un grado asignado antes de definir su curso.' });
    }

    const configuration = await ensureAcademicStructureConfiguration(schoolId);
    const serialized = serializeAcademicStructureConfiguration(configuration);
    const grade = findAcademicStructureGradeForStudent(student.grade, serialized.grades);

    if (!grade) {
      return res.status(400).json({ message: 'El grado del alumno todavía no existe en la estructura académica.' });
    }

    if (isCoordinationUser) {
      const allowedLevelKeys = resolveCoordinationLevelKeys(serialized, req.user?.coordinationScope);
      if (!allowedLevelKeys.has(normalizeText(grade.levelKey))) {
        return res.status(403).json({ message: 'No tienes permiso para asignar cursos fuera de tu nivel de coordinación.' });
      }
    }

    const normalizedCourseKey = normalizeGradeCourseKey(courseKey);
    if (!gradeHasCourse(grade, normalizedCourseKey)) {
      return res.status(400).json({ message: 'El curso seleccionado no pertenece al grado del alumno.' });
    }

    const selectedCourse = resolveGradeCourses(grade).find((course) => normalizeGradeCourseKey(course.key) === normalizedCourseKey);
    if (!selectedCourse) {
      return res.status(400).json({ message: 'El curso seleccionado no pertenece al grado del alumno.' });
    }

    const previousCourseKey = normalizeText(student.course);
    student.course = selectedCourse.key;
    await student.save();

    let courseAssignmentNotification = { notificationsCreated: 0, tokensFound: 0 };
    if (previousCourseKey !== selectedCourse.key) {
      const courseLabel = buildAcademicCourseDisplayLabel(grade, selectedCourse, grade.courses) || selectedCourse.label || selectedCourse.key;
      try {
        courseAssignmentNotification = await queueStudentParentNotification({
          schoolId,
          studentId: student._id,
          title: 'Curso asignado',
          body: `El alumno ${student.name || 'seleccionado'} ha sido asignado al curso ${courseLabel}.`,
          payload: {
            type: 'academic.course_assigned',
            courseKey: selectedCourse.key,
            courseLabel,
            gradeKey: grade.key,
            studentId: String(student._id),
            url: buildParentPushUrl('academic.course_assigned', { studentId: student._id }),
          },
        });
      } catch (notificationError) {
        console.warn(`[ACADEMIC_COURSE_ASSIGNMENT_PUSH_FAILED] studentId=${student._id} course=${selectedCourse.key} error=${notificationError.message}`);
      }
    }

    return res.status(200).json({
      student: {
        _id: student._id,
        name: student.name,
        grade: student.grade,
        course: student.course,
      },
      academicStructure: serialized,
      notification: courseAssignmentNotification,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/fee-settings', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const academicStructure = await ensureAcademicStructureConfiguration(schoolId);
    const serializedAcademicStructure = serializeAcademicStructureConfiguration(academicStructure);
    const grades = serializedAcademicStructure.grades.map((grade) => grade.key).filter(Boolean);
    const configuration = await ensureAcademicFeeConfiguration(schoolId, grades);
    const snapshotCostsByGrade = await loadSnapshotCostsByGrade(schoolId);
    const repairedGradeSettings = canonicalizeGradeFeeSettingsForStructure(
      configuration.gradeSettings || [],
      serializedAcademicStructure.grades,
      { snapshotCostsByGrade },
    );
    const currentSummary = JSON.stringify(summarizeGradeFeeSettingsForComparison(configuration.gradeSettings || []));
    const repairedSummary = JSON.stringify(summarizeGradeFeeSettingsForComparison(repairedGradeSettings));

    let billingSync = null;
    if (currentSummary !== repairedSummary) {
      configuration.gradeSettings = repairedGradeSettings;
      await configuration.save();
      const { syncSchoolBillingProfilesFromFeeConfiguration } = require('../services/academicConsolidatedBilling.service');
      billingSync = await syncSchoolBillingProfilesFromFeeConfiguration({
        schoolId,
        feeConfiguration: configuration.toObject ? configuration.toObject() : configuration,
      }).catch((syncError) => {
        console.warn(`[FEE_SETTINGS_REPAIR] school=${schoolId} error=${syncError.message}`);
        return { updatedProfiles: 0, refreshedCharges: 0, error: syncError.message };
      });
    }

    return res.status(200).json({
      ...serializeAcademicFeeConfigurationForStructure(configuration, serializedAcademicStructure.grades, { snapshotCostsByGrade }),
      billingSync,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.put('/fee-settings', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const payload = req.body || {};
    const academicStructure = await ensureAcademicStructureConfiguration(schoolId);
    const serializedAcademicStructure = serializeAcademicStructureConfiguration(academicStructure);
    const schoolYearConfiguration = normalizeAcademicSchoolYearConfiguration(payload);
    const snapshotCostsByGrade = await loadSnapshotCostsByGrade(schoolId);
    const canonicalGradeSettings = canonicalizeGradeFeeSettingsForStructure(
      normalizeGradeFeeSettings(payload.gradeSettings),
      serializedAcademicStructure.grades,
      { snapshotCostsByGrade },
    );
    const saved = await AcademicFeeConfiguration.findOneAndUpdate(
      { schoolId },
      {
        schoolId,
        academicYear: normalizeText(payload.academicYear) || getCurrentAcademicYear(),
        schoolYearStartDate: schoolYearConfiguration.startDate,
        schoolYearEndDate: schoolYearConfiguration.endDate,
        lateEnrollmentSurchargeType: schoolYearConfiguration.lateEnrollmentSurchargeType,
        lateEnrollmentSurchargeValue: schoolYearConfiguration.lateEnrollmentSurchargeValue,
        schoolYearLevels: normalizeAcademicSchoolYearLevelSettings(payload.schoolYearLevels),
        benefitRules: normalizeBenefitRules(payload.benefitRules),
        enrollmentBenefitRules: normalizeEnrollmentBenefitRules(payload.enrollmentBenefitRules),
        gradeSettings: canonicalGradeSettings,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const { syncSchoolBillingProfilesFromFeeConfiguration } = require('../services/academicConsolidatedBilling.service');
    const billingSync = await syncSchoolBillingProfilesFromFeeConfiguration({
      schoolId,
      feeConfiguration: saved.toObject ? saved.toObject() : saved,
    }).catch((syncError) => {
      console.warn(`[FEE_SETTINGS_SYNC] school=${schoolId} error=${syncError.message}`);
      return { updatedProfiles: 0, refreshedCharges: 0, error: syncError.message };
    });

    return res.status(200).json({
      ...serializeAcademicFeeConfigurationForStructure(saved, serializedAcademicStructure.grades, { snapshotCostsByGrade }),
      billingSync,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/database', async (req, res) => {
  try {
    const { schoolId } = req.user;
    return res.status(200).json(await buildAcademicDatabaseSummary(schoolId));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.patch('/database/:studentId', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const studentId = toObjectId(req.params.studentId);

    if (!studentId) {
      return res.status(400).json({ message: 'Alumno invalido para actualizar.' });
    }

    const student = await Student.findOne({ _id: studentId, schoolId, deletedAt: null });
    if (!student) {
      return res.status(404).json({ message: 'No se encontró el alumno solicitado.' });
    }

    const birthDate = parseAcademicDatabaseEditDate(req.body?.birthDate);
    if (birthDate === 'invalid') {
      return res.status(400).json({ message: 'La fecha de nacimiento no tiene un formato valido.' });
    }

    const entryDate = parseAcademicDatabaseEditDate(req.body?.entryDate);
    if (entryDate === 'invalid') {
      return res.status(400).json({ message: 'La fecha de ingreso no tiene un formato valido.' });
    }

    const firstName = normalizeText(req.body?.firstName);
    const lastName = normalizeText(req.body?.lastName);
    const grade = normalizeText(req.body?.grade);

    if (!firstName || !lastName || !grade) {
      return res.status(400).json({ message: 'Grado, nombres y apellidos son obligatorios.' });
    }

    student.firstName = firstName;
    student.lastName = lastName;
    student.name = normalizeText(`${firstName} ${lastName}`);
    student.grade = grade;
    student.course = normalizeText(req.body?.course);
    student.schoolCode = normalizeText(req.body?.schoolCode);
    student.gender = normalizeAcademicDatabaseGender(req.body?.gender);
    student.documentType = normalizeAcademicDatabaseDocumentType(req.body?.documentType);
    student.documentNumber = normalizeText(req.body?.documentNumber);
    student.birthDate = birthDate;
    student.entryDate = entryDate;
    student.bloodType = normalizeText(req.body?.bloodType);
    student.birthPlace = normalizeText(req.body?.birthPlace);
    student.address = normalizeText(req.body?.address);
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'medicalProfile')) {
      student.medicalProfile = normalizeAcademicStudentMedicalProfile(req.body?.medicalProfile);
    }
    await student.save();

    const parentConfigs = [
      { key: 'mother', relationship: 'mother' },
      { key: 'father', relationship: 'father' },
    ];

    for (const config of parentConfigs) {
      const parentId = toObjectId(req.body?.[`${config.key}Id`]);
      const parentPayload = {
        name: normalizeText(req.body?.[`${config.key}Name`]),
        documentType: normalizeAcademicDatabaseDocumentType(req.body?.[`${config.key}DocumentType`]),
        documentNumber: normalizeText(req.body?.[`${config.key}DocumentNumber`]),
        phone: normalizeText(req.body?.[`${config.key}Phone`]),
        email: normalizeEmail(req.body?.[`${config.key}Email`]),
        address: normalizeText(req.body?.address),
      };
      const hasValues = Object.values(parentPayload).some(Boolean);

      if (parentId) {
        const parent = await User.findOne({ _id: parentId, schoolId, role: 'parent', deletedAt: null });
        if (parent) {
          parent.name = parentPayload.name || parent.name;
          parent.documentType = parentPayload.documentType;
          parent.documentNumber = parentPayload.documentNumber;
          parent.phone = parentPayload.phone;
          parent.email = parentPayload.email;
          parent.address = parentPayload.address;
          await parent.save();
        }
      } else if (hasValues && parentPayload.name) {
        const parentResult = await upsertParentAccount({
          schoolId,
          parentData: parentPayload,
          relationship: config.relationship,
          matchByLooseIdentity: true,
        });

        if (parentResult?.user?._id) {
          await ParentStudentLink.findOneAndUpdate(
            { schoolId, parentId: parentResult.user._id, studentId: student._id },
            {
              schoolId,
              parentId: parentResult.user._id,
              studentId: student._id,
              relationship: config.relationship,
              status: 'active',
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
        }
      }
    }

    const feeConfiguration = await ensureAcademicFeeConfiguration(schoolId, [grade]);
    const gradeFeeSetting = findGradeFeeSetting(feeConfiguration, grade);
    const enrollmentPricing = calculateProratedAcademicEnrollmentFee(gradeFeeSetting?.enrollmentFee || 0, entryDate, feeConfiguration, grade);
    const annualTuitionAdditionalDiscountPercent = normalizeAcademicAdditionalDiscountPercent(req.body?.annualTuitionAdditionalDiscountPercent);
    const annualTuitionAdditionalDiscountAmount = Math.max(0, Math.round(Number(enrollmentPricing.amount || 0) * (annualTuitionAdditionalDiscountPercent / 100)));
    const annualTuitionAmount = Math.max(0, Number(enrollmentPricing.amount || 0) - annualTuitionAdditionalDiscountAmount);
    const annualTuitionDueDate = resolveAcademicAnnualTuitionFirstDueDate({
      feeConfiguration,
      grade,
      fallbackDate: entryDate || new Date(),
      referenceDate: new Date(),
      enrollmentPricing,
    });
    let billingProfile = await StudentBillingProfile.findOne({ schoolId, studentId: student._id });
    if (!billingProfile) {
      billingProfile = new StudentBillingProfile({ schoolId, studentId: student._id, active: true });
    }
    billingProfile.grade = grade;
    billingProfile.academicYear = normalizeText(feeConfiguration?.academicYear) || getCurrentAcademicYear();
    billingProfile.entryDate = entryDate;
    billingProfile.enrollmentBonusAmount = Number(gradeFeeSetting?.enrollmentBonus || 0);
    billingProfile.enrollmentBonusInstallments = normalizeAcademicInstallmentCount(req.body?.enrollmentBonusInstallments, billingProfile.enrollmentBonusInstallments || 1);
    billingProfile.annualTuitionAmount = annualTuitionAmount;
    billingProfile.annualTuitionInstallments = normalizeAcademicInstallmentCount(req.body?.annualTuitionInstallments, billingProfile.annualTuitionInstallments || 1);
    billingProfile.annualTuitionDueDate = annualTuitionDueDate;
    billingProfile.annualTuitionBaseAmount = Number(enrollmentPricing.baseAmount || 0);
    billingProfile.annualTuitionDiscountAmount = Number(enrollmentPricing.enrollmentBenefitDiscountAmount || 0);
    billingProfile.annualTuitionBenefitLabel = normalizeText(enrollmentPricing.enrollmentBenefitLabel);
    billingProfile.annualTuitionAdditionalDiscountPercent = annualTuitionAdditionalDiscountPercent;
    billingProfile.annualTuitionAdditionalDiscountAmount = annualTuitionAdditionalDiscountAmount;
    billingProfile.annualTuitionAdditionalDiscountLabel = normalizeText(req.body?.annualTuitionAdditionalDiscountLabel);
    billingProfile.monthlyTuitionAmount = Number(gradeFeeSetting?.monthlyTuition || 0);
    billingProfile.initialEnrollmentAndFirstTuitionPaid = Boolean(req.body?.initialEnrollmentAndFirstTuitionPaid);
    billingProfile.monthlyTuitionAdditionalDiscountPercent = normalizeAcademicAdditionalDiscountPercent(req.body?.monthlyTuitionAdditionalDiscountPercent);
    billingProfile.monthlyTuitionAdditionalDiscountLabel = normalizeText(req.body?.monthlyTuitionAdditionalDiscountLabel);
    billingProfile.dueDay = DEFAULT_ACADEMIC_MONTHLY_DUE_DAY;
    billingProfile.benefitRules = resolveAcademicFeeBenefitRules(feeConfiguration, gradeFeeSetting);
    billingProfile.active = true;
    await billingProfile.save();

    const { refreshPendingIndividualTuitionCharges } = require('../services/academicConsolidatedBilling.service');
    await refreshPendingIndividualTuitionCharges({
      schoolId,
      studentIds: [student._id],
    }).catch((syncError) => {
      console.warn(`[ACADEMIC_DATABASE_BILLING_REFRESH] studentId=${student._id} error=${syncError.message}`);
    });

    const rows = await buildAcademicDatabaseSummary(schoolId);
    const updatedRow = rows.find((item) => String(item._id) === String(student._id)) || null;
    return res.status(200).json({ message: 'Fila académica actualizada.', item: updatedRow });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/database/promotions/request', async (req, res) => {
  try {
    const { schoolId, userId, name } = req.user;
    const existingPending = await AcademicGradePromotionRequest.findOne({ schoolId, status: 'pending' }).select('_id');
    if (existingPending) {
      return res.status(400).json({ message: 'Ya existe una solicitud pendiente para subir de grado a todos los alumnos.' });
    }

    const students = await Student.find({ schoolId, deletedAt: null }).select('grade').lean();
    if (!students.length) {
      return res.status(400).json({ message: 'No hay alumnos registrados para generar la solicitud.' });
    }

    const impact = buildAcademicGradePromotionPreview(students);
    if (!impact.promotableStudents) {
      return res.status(400).json({ message: 'No se encontraron grados promocionables con la regla actual.' });
    }

    const requestRecord = await AcademicGradePromotionRequest.create({
      schoolId,
      requestedByUserId: userId,
      requestedByName: normalizeText(name) || 'Secretaría académica',
      status: 'pending',
      totalStudents: impact.totalStudents,
      promotableStudents: impact.promotableStudents,
      skippedStudents: impact.skippedStudents,
      preview: impact.preview,
    });

    return res.status(201).json({
      message: 'Solicitud enviada a rectoría para subir un grado a todos los alumnos.',
      item: requestRecord,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/database/import', (req, res) => {
  uploadAcademicDatabaseMigrationFile(req, res, async (error) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'El archivo supera el tamano maximo permitido de 10 MB.' });
    }

    if (error) {
      return res.status(400).json({ message: error.message || 'No se pudo procesar el archivo de migracion.' });
    }

    try {
      const { schoolId } = req.user;
      if (!req.file?.buffer) {
        return res.status(400).json({ message: 'Debes adjuntar un archivo Excel o CSV para migrar la base de datos.' });
      }

      const parsedRows = readAcademicDatabaseImportFile(req.file.buffer);
      if (!parsedRows.length) {
        return res.status(400).json({ message: 'La plantilla no contiene filas con datos para importar.' });
      }

      if (parsedRows.length > 5000) {
        return res.status(400).json({ message: 'La plantilla supera el limite permitido de 5000 filas por carga.' });
      }

      const academicStructure = await ensureAcademicStructureConfiguration(schoolId);
      const structureGrades = Array.isArray(academicStructure?.grades) ? academicStructure.grades : [];
      const resolvedRows = parsedRows.map((row) => ({
        ...row,
        grade: resolveAcademicStructureGradeKey(row.grade, structureGrades),
      }));

      const distinctGrades = Array.from(new Set(resolvedRows.map((row) => normalizeText(row.grade)).filter(Boolean)));
      const feeConfiguration = await ensureAcademicFeeConfiguration(schoolId, distinctGrades);
      const summary = {
        totalRows: parsedRows.length,
        processedRows: 0,
        createdStudents: 0,
        updatedStudents: 0,
        createdParents: 0,
        updatedParents: 0,
        createdBillingProfiles: 0,
        updatedBillingProfiles: 0,
        createdLinks: 0,
        skippedRows: 0,
        errors: 0,
      };
      const rowErrors = [];
      const parentCache = new Map();
      const createdParentIds = new Set();
      const updatedParentIds = new Set();

      for (const row of resolvedRows) {
        try {
          if (!row.grade || !row.firstName || !row.lastName) {
            summary.skippedRows += 1;
            if (rowErrors.length < 30) {
              rowErrors.push({ row: row.rowNumber, message: 'La fila no tiene Grado, Nombres y Apellidos completos.' });
            }
            continue;
          }

          const linkedParents = [];
          for (const parentEntry of [
            { data: row.mother, relationship: 'mother' },
            { data: row.father, relationship: 'father' },
          ]) {
            const cacheKey = buildParentImportCacheKey(parentEntry.data, parentEntry.relationship);
            let parentResult = cacheKey ? parentCache.get(cacheKey) || null : null;

            if (!parentResult) {
              parentResult = await upsertParentAccount({
                schoolId,
                parentData: parentEntry.data,
                relationship: parentEntry.relationship,
                matchByLooseIdentity: true,
              });
              if (parentResult && cacheKey) {
                parentCache.set(cacheKey, parentResult);
              }
            }

            if (parentResult) {
              linkedParents.push({ ...parentResult, relationship: parentEntry.relationship });
              if (parentResult.created) {
                createdParentIds.add(String(parentResult.user._id));
              } else {
                updatedParentIds.add(String(parentResult.user._id));
              }
            }
          }

          const studentPayload = {
            firstName: row.firstName,
            lastName: row.lastName,
            documentNumber: row.documentNumber,
            grade: row.grade,
            birthDate: row.birthDate,
          };
          const existingStudentResult = await findExistingStudentForAcademicImport({ schoolId, studentData: studentPayload });
          if (existingStudentResult.ambiguous) {
            summary.skippedRows += 1;
            if (rowErrors.length < 30) {
              rowErrors.push({ row: row.rowNumber, message: 'No se pudo decidir si el alumno ya existe porque hay coincidencias duplicadas.' });
            }
            continue;
          }

          const studentName = normalizeText(`${row.firstName} ${row.lastName}`);
          const studentData = {
            schoolId,
            name: studentName,
            firstName: row.firstName,
            lastName: row.lastName,
            grade: row.grade,
            gender: row.gender,
            documentType: row.documentType,
            documentNumber: row.documentNumber,
            birthDate: row.birthDate,
            bloodType: row.bloodType,
            birthPlace: row.birthPlace,
            address: row.address,
            status: 'active',
            deletedAt: null,
          };

          let student = existingStudentResult.student;
          if (student) {
            Object.assign(student, studentData);
            await student.save();
            summary.updatedStudents += 1;
          } else {
            student = await Student.create({
              ...studentData,
              course: '',
              schoolCode: '',
            });
            summary.createdStudents += 1;
          }

          await ensureStudentWallet({ schoolId, studentId: student._id });

          try {
            await upsertStudentAccount({ schoolId, student });
          } catch (accountError) {
            console.warn('[STUDENT_ACCOUNT_UPSERT_ERROR]', accountError?.message || accountError);
          }

          const gradeFeeSetting = findGradeFeeSetting(feeConfiguration, row.grade);
          const existingBillingProfile = await StudentBillingProfile.findOne({ schoolId, studentId: student._id });
          const billingProfilePayload = {
            schoolId,
            studentId: student._id,
            grade: row.grade,
            academicYear: normalizeText(feeConfiguration?.academicYear) || getCurrentAcademicYear(),
            enrollmentBonusAmount: Number(gradeFeeSetting?.enrollmentBonus || 0),
            annualTuitionAmount: Number(gradeFeeSetting?.enrollmentFee || 0),
            monthlyTuitionAmount: Number(gradeFeeSetting?.monthlyTuition || 0),
            dueDay: DEFAULT_ACADEMIC_MONTHLY_DUE_DAY,
            benefitRules: resolveAcademicFeeBenefitRules(feeConfiguration, gradeFeeSetting),
            active: true,
          };

          if (existingBillingProfile) {
            Object.assign(existingBillingProfile, billingProfilePayload);
            await existingBillingProfile.save();
            summary.updatedBillingProfiles += 1;
          } else {
            await StudentBillingProfile.create(billingProfilePayload);
            summary.createdBillingProfiles += 1;
          }

          for (const parentRecord of linkedParents) {
            const existingLink = await ParentStudentLink.findOne({
              schoolId,
              parentId: parentRecord.user._id,
              studentId: student._id,
            }).select('_id');

            if (!existingLink) {
              summary.createdLinks += 1;
            }

            await ParentStudentLink.findOneAndUpdate(
              { schoolId, parentId: parentRecord.user._id, studentId: student._id },
              {
                schoolId,
                parentId: parentRecord.user._id,
                studentId: student._id,
                relationship: parentRecord.relationship,
                status: 'active',
              },
              { upsert: true, new: true, setDefaultsOnInsert: true }
            );
          }

          summary.processedRows += 1;
        } catch (rowError) {
          summary.errors += 1;
          if (rowErrors.length < 30) {
            rowErrors.push({ row: row.rowNumber, message: rowError.message || 'No se pudo importar la fila.' });
          }
        }
      }

      summary.createdParents = createdParentIds.size;
      summary.updatedParents = Array.from(updatedParentIds).filter((parentId) => !createdParentIds.has(parentId)).length;

      return res.status(200).json({
        message: 'Migracion de base de datos completada.',
        summary,
        rowErrors,
      });
    } catch (requestError) {
      return res.status(400).json({ message: requestError.message || 'No se pudo importar la plantilla de base de datos.' });
    }
  });
});

router.get('/communication-requests', async (req, res) => {
  try {
    const { schoolId } = req.user;
    return res.status(200).json(await buildCommunicationRequestSummary(schoolId));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/communications/uploads/media', (req, res) => {
  uploadAcademicCommunicationMedia(req, res, async (error) => {
    if (error) {
      return res.status(400).json({ message: error.message || 'No se pudo cargar el archivo del comunicado.' });
    }

    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ message: 'No se recibio ningun archivo.' });
      }

      const mimeType = String(req.file.mimetype || '').toLowerCase();
      const preferredName = normalizeText(req.body?.preferredName) || 'comunicado';

      if (mimeType.startsWith('video/')) {
        const [saved] = await processStoredCampusMaterialFiles([req.file], {
          folder: 'academic-communications',
          requireCloudinary: true,
        });

        if (!saved || saved.kind !== 'video' || saved.storage !== 'cloudinary' || !/^https?:\/\//i.test(saved.url || '')) {
          return res.status(503).json({ message: 'No se pudo guardar el video. Intenta de nuevo en unos segundos.' });
        }

        return res.status(201).json({
          kind: 'video',
          url: saved.url,
          imageUrl: '',
          videoUrl: saved.url,
          thumbUrl: '',
          storage: 'cloudinary',
        });
      }

      if (!mimeType.startsWith('image/')) {
        return res.status(400).json({ message: 'Solo se permiten imagenes o videos para el feed.' });
      }

      const saved = await processAndStoreUploadedImage({
        file: req.file,
        folder: 'academic-communications',
        preferredName,
        requireCloudinary: true,
      });

      if (saved.storage !== 'cloudinary' || !/^https?:\/\//i.test(saved.url || '')) {
        return res.status(503).json({ message: 'No se pudo guardar la imagen. Intenta de nuevo en unos segundos.' });
      }

      const thumbUrl = /^https?:\/\//i.test(saved.thumbUrl || '') ? saved.thumbUrl : saved.url;

      return res.status(201).json({
        kind: 'image',
        url: saved.url,
        imageUrl: saved.url,
        videoUrl: '',
        thumbUrl,
        storage: 'cloudinary',
      });
    } catch (requestError) {
      return res.status(400).json({ message: requestError.message || 'No se pudo guardar el archivo del comunicado.' });
    }
  });
});

router.post('/communications/ai-copy', async (req, res) => {
  try {
    const kind = normalizeText(req.body?.kind).toLowerCase() === 'body' ? 'body' : 'title';
    const sourceTitle = normalizeText(req.body?.sourceTitle);
    const sourceBody = normalizeText(req.body?.sourceBody);

    if (!sourceTitle && !sourceBody) {
      return res.status(400).json({ message: 'Debes escribir un titulo o mensaje base para generar una sugerencia con IA.' });
    }

    const suggestion = await generateAcademicSecretaryAiSuggestion({ kind, sourceTitle, sourceBody });
    return res.status(200).json({ suggestion });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/communication-authors', async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const name = normalizeText(req.body?.name);
    const photoUrl = normalizeText(req.body?.photoUrl);
    const thumbUrl = normalizeText(req.body?.thumbUrl) || photoUrl;

    if (!name) {
      return res.status(400).json({ message: 'El nombre del autor es obligatorio.' });
    }

    if (!photoUrl) {
      return res.status(400).json({ message: 'La foto del autor es obligatoria.' });
    }

    const author = await AcademicCommunicationAuthor.create({
      schoolId,
      createdByUserId: userId,
      name,
      photoUrl,
      thumbUrl,
    });

    return res.status(201).json({ author: serializeCommunicationAuthor(author) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.put('/communication-authors/:authorId', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const authorObjectId = toObjectId(req.params.authorId);
    const name = normalizeText(req.body?.name);
    const photoUrl = normalizeText(req.body?.photoUrl);
    const thumbUrl = normalizeText(req.body?.thumbUrl) || photoUrl;

    if (!authorObjectId) {
      return res.status(400).json({ message: 'Autor inválido.' });
    }

    if (!name) {
      return res.status(400).json({ message: 'El nombre del autor es obligatorio.' });
    }

    const author = await AcademicCommunicationAuthor.findOne({ _id: authorObjectId, schoolId, active: true });
    if (!author) {
      return res.status(404).json({ message: 'Autor no encontrado.' });
    }

    author.name = name;
    author.photoUrl = photoUrl;
    author.thumbUrl = thumbUrl;
    await author.save();

    const communicationFilter = author.isDefault
      ? {
        schoolId,
        $or: [
          { authorId: author._id },
          { authorId: null },
          { authorId: { $exists: false } },
          { authorName: { $in: ['', 'Secretaría académica', 'Secretaría Académica'] } },
        ],
      }
      : { schoolId, authorId: author._id };

    await AcademicCommunication.updateMany(
      communicationFilter,
      {
        $set: {
          authorId: author._id,
          authorName: author.name,
          authorPhotoUrl: author.photoUrl,
          authorThumbUrl: author.thumbUrl || author.photoUrl,
        },
      }
    );

    return res.status(200).json({ author: serializeCommunicationAuthor(author) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.delete('/communication-authors/:authorId', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const authorObjectId = toObjectId(req.params.authorId);

    if (!authorObjectId) {
      return res.status(400).json({ message: 'Autor inválido.' });
    }

    const author = await AcademicCommunicationAuthor.findOne({ _id: authorObjectId, schoolId, active: true });
    if (!author) {
      return res.status(404).json({ message: 'Autor no encontrado.' });
    }

    if (author.isDefault) {
      const replacementAuthors = await AcademicCommunicationAuthor.find({
        _id: { $ne: author._id },
        schoolId,
        active: true,
      }).sort({ createdAt: -1 });
      const normalizedAuthorName = normalizeText(author.name).toLowerCase();
      const replacementAuthor = replacementAuthors.find((item) => (
        normalizeText(item.name).toLowerCase() === normalizedAuthorName
        && (normalizeText(item.thumbUrl) || normalizeText(item.photoUrl))
      )) || replacementAuthors.find((item) => normalizeText(item.thumbUrl) || normalizeText(item.photoUrl)) || replacementAuthors[0];

      if (!replacementAuthor) {
        return res.status(400).json({ message: 'Crea o actualiza otro autor antes de eliminar el autor base.' });
      }

      replacementAuthor.isDefault = true;
      await replacementAuthor.save();

      await AcademicCommunication.updateMany(
        {
          schoolId,
          $or: [
            { authorId: author._id },
            { authorId: null },
            { authorId: { $exists: false } },
            { authorName: { $in: ['', 'Secretaría académica', 'Secretaría Académica'] } },
          ],
        },
        {
          $set: {
            authorId: replacementAuthor._id,
            authorName: replacementAuthor.name,
            authorPhotoUrl: replacementAuthor.photoUrl,
            authorThumbUrl: replacementAuthor.thumbUrl || replacementAuthor.photoUrl,
          },
        }
      );
    }

    author.isDefault = false;
    author.active = false;
    await author.save();

    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/communications', async (req, res) => {
  try {
    const { schoolId, userId, name } = req.user;
    const {
      title,
      body,
      audienceType,
      gradeTargets = [],
      courseTargets = [],
      parentTargets = [],
      studentTargets = [],
      emailSubject = '',
      media = [],
      channels = { push: true, email: true },
      schoolName = 'Comergio',
      authorId = '',
      authorName = '',
      authorPhotoUrl = '',
      authorThumbUrl = '',
    } = req.body || {};

    if (!normalizeText(title) || !normalizeText(body)) {
      return res.status(400).json({ message: 'title and body are required' });
    }

    const audience = await resolveAudienceMembers({ schoolId, audienceType, gradeTargets, courseTargets, parentTargets, studentTargets });
    if (!audience.parents.length) {
      return res.status(400).json({ message: 'No se encontraron acudientes para el filtro seleccionado.' });
    }

    const normalizedMedia = normalizeCommunicationMedia(media);
    const selectedAuthor = await resolveCommunicationAuthor({ schoolId, authorId, authorName, authorPhotoUrl, authorThumbUrl });

    const communication = await AcademicCommunication.create({
      schoolId,
      createdByUserId: userId,
      createdByName: name,
      authorId: selectedAuthor.authorId,
      authorName: selectedAuthor.authorName,
      authorPhotoUrl: selectedAuthor.authorPhotoUrl,
      authorThumbUrl: selectedAuthor.authorThumbUrl,
      title: normalizeText(title),
      body: normalizeText(body),
      audienceType: normalizeText(audienceType) || 'general',
      gradeTargets: normalizeArray(gradeTargets),
      courseTargets: normalizeArray(courseTargets),
      parentTargets: audienceType === 'individual' ? audience.parentIds : [],
      studentTargets: audience.studentIds,
      recipientParentIds: audience.parentIds,
      recipientStudentIds: audience.studentIds,
      emailSubject: normalizeText(emailSubject) || normalizeText(title),
      media: normalizedMedia,
      channels: {
        push: channels?.push !== false,
        email: false,
      },
      sentAt: new Date(),
    });

    dispatchCommunicationInBackground({
      schoolId,
      schoolName,
      communicationId: communication._id,
      parents: audience.parents,
    });

    return res.status(201).json({ communication, deliverySummary: { status: 'queued' } });
  } catch (error) {
    const statusCode = Number(error?.statusCode || 0);
    const message = error?.message || 'No se pudo publicar el comunicado.';
    const isValidationError = statusCode === 400
      || message.includes('Vuelve a subir')
      || message.includes('are required')
      || message.includes('No se encontraron acudientes');
    return res.status(isValidationError ? 400 : 500).json({ message });
  }
});

router.put('/communications/:id', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const communicationId = toObjectId(req.params.id);
    if (!communicationId) {
      return res.status(400).json({ message: 'communicationId is required' });
    }

    const {
      title,
      body,
      audienceType,
      gradeTargets = [],
      courseTargets = [],
      parentTargets = [],
      studentTargets = [],
      emailSubject = '',
      media = [],
      channels = { push: true, email: true },
      authorId = '',
      authorName = '',
      authorPhotoUrl = '',
      authorThumbUrl = '',
    } = req.body || {};

    if (!normalizeText(title) || !normalizeText(body)) {
      return res.status(400).json({ message: 'title and body are required' });
    }

    const communication = await AcademicCommunication.findOne({ _id: communicationId, schoolId });
    if (!communication) {
      return res.status(404).json({ message: 'Comunicado no encontrado.' });
    }

    const audience = await resolveAudienceMembers({ schoolId, audienceType, gradeTargets, courseTargets, parentTargets, studentTargets });
    if (!audience.parents.length) {
      return res.status(400).json({ message: 'No se encontraron acudientes para el filtro seleccionado.' });
    }

    const selectedAuthor = await resolveCommunicationAuthor({ schoolId, authorId, authorName, authorPhotoUrl, authorThumbUrl });

    communication.title = normalizeText(title);
    communication.body = normalizeText(body);
    communication.authorId = selectedAuthor.authorId;
    communication.authorName = selectedAuthor.authorName;
    communication.authorPhotoUrl = selectedAuthor.authorPhotoUrl;
    communication.authorThumbUrl = selectedAuthor.authorThumbUrl;
    communication.audienceType = normalizeText(audienceType) || 'general';
    communication.gradeTargets = normalizeArray(gradeTargets);
    communication.courseTargets = normalizeArray(courseTargets);
    communication.parentTargets = audienceType === 'individual' ? audience.parentIds : [];
    communication.studentTargets = audience.studentIds;
    communication.recipientParentIds = audience.parentIds;
    communication.recipientStudentIds = audience.studentIds;
    communication.emailSubject = normalizeText(emailSubject) || normalizeText(title);
    communication.media = normalizeCommunicationMedia(media);
    communication.channels = {
      push: channels?.push !== false,
      email: false,
    };

    await communication.save();

    return res.status(200).json({ communication });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.delete('/communications/:communicationId/comments/:commentId', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const communicationId = toObjectId(req.params.communicationId);
    if (!communicationId) {
      return res.status(400).json({ message: 'Comunicado inválido.' });
    }

    const communication = await AcademicCommunication.findOne({ _id: communicationId, schoolId });
    if (!communication) {
      return res.status(404).json({ message: 'Comunicado no encontrado.' });
    }

    const comment = communication.comments.id(req.params.commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Comentario no encontrado.' });
    }

    comment.deleteOne();
    await communication.save();

    return res.status(200).json({ communication: serializeCommunicationForDashboard(communication.toObject()) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.delete('/communications/:id', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const communicationId = toObjectId(req.params.id);
    if (!communicationId) {
      return res.status(400).json({ message: 'communicationId is required' });
    }

    const deletedCommunication = await AcademicCommunication.findOneAndDelete({ _id: communicationId, schoolId });
    if (!deletedCommunication) {
      return res.status(404).json({ message: 'Comunicado no encontrado.' });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/communication-requests/:id/approve', async (req, res) => {
  try {
    const { schoolId, userId, name } = req.user;
    const requestId = toObjectId(req.params.id);
    const schoolName = normalizeText(req.body?.schoolName) || 'Comergio';

    if (!requestId) {
      return res.status(400).json({ message: 'Invalid request id.' });
    }

    const pendingRequest = await AcademicCommunicationRequest.findOne({
      _id: requestId,
      schoolId,
      status: 'pending',
    })
      .populate('teacherUserId', 'name username campusPhotoUrl campusPhotoThumbUrl')
      .populate('courseId', 'title subject');

    if (!pendingRequest) {
      return res.status(404).json({ message: 'Solicitud no encontrada o ya procesada.' });
    }

    const nextTitle = normalizeText(req.body?.title) || normalizeText(pendingRequest.title);
    const nextBody = normalizeText(req.body?.body) || normalizeText(pendingRequest.body);
    const nextEmailSubject = normalizeText(req.body?.emailSubject) || normalizeText(pendingRequest.emailSubject) || nextTitle;
    const reviewNotes = normalizeText(req.body?.reviewNotes);
    const nextAudienceType = normalizeText(req.body?.audienceType) || normalizeText(pendingRequest.audienceType) || 'general';
    const nextGradeTargets = normalizeArray(Array.isArray(req.body?.gradeTargets) ? req.body.gradeTargets : pendingRequest.gradeTargets);
    const nextCourseTargets = normalizeArray(Array.isArray(req.body?.courseTargets) ? req.body.courseTargets : pendingRequest.courseTargets);
    const nextParentTargets = Array.isArray(req.body?.parentTargets) ? req.body.parentTargets : pendingRequest.parentTargets;
    const nextStudentTargets = Array.isArray(req.body?.studentTargets) ? req.body.studentTargets : pendingRequest.studentTargets;
    const normalizedMedia = normalizeCommunicationMedia(
      Array.isArray(req.body?.media) ? req.body.media : pendingRequest.media
    );

    if (!nextTitle || !nextBody) {
      return res.status(400).json({ message: 'La solicitud aprobada debe tener titulo y mensaje.' });
    }

    if (!['general', 'grade', 'course', 'individual'].includes(nextAudienceType)) {
      return res.status(400).json({ message: 'Tipo de audiencia invalido para publicar la solicitud.' });
    }

    const audience = await resolveAudienceMembers({
      schoolId,
      audienceType: nextAudienceType,
      gradeTargets: nextGradeTargets,
      courseTargets: nextCourseTargets,
      parentTargets: nextParentTargets,
      studentTargets: nextStudentTargets,
    });

    if (!audience.parents.length) {
      return res.status(400).json({ message: 'No se encontraron acudientes para publicar esta solicitud.' });
    }

    const communication = await AcademicCommunication.create({
      schoolId,
      createdByUserId: userId,
      createdByName: name,
      authorName: buildTeacherCommunicationAuthorName(pendingRequest),
      authorPhotoUrl: normalizeText(pendingRequest.teacherUserId?.campusPhotoUrl),
      authorThumbUrl: normalizeText(pendingRequest.teacherUserId?.campusPhotoThumbUrl || pendingRequest.teacherUserId?.campusPhotoUrl),
      title: nextTitle,
      body: nextBody,
      audienceType: nextAudienceType,
      gradeTargets: nextGradeTargets,
      courseTargets: nextCourseTargets,
      parentTargets: nextAudienceType === 'individual' ? audience.parentIds : [],
      studentTargets: audience.studentIds,
      recipientParentIds: audience.parentIds,
      recipientStudentIds: audience.studentIds,
      emailSubject: nextEmailSubject,
      media: normalizedMedia,
      channels: {
        push: pendingRequest.channels?.push !== false,
        email: pendingRequest.channels?.email !== false,
      },
      sentAt: new Date(),
    });

    const deliverySummary = await dispatchCommunication({
      schoolId,
      schoolName,
      communication,
      parents: audience.parents,
    });

    communication.deliverySummary = deliverySummary;
    await communication.save();

    pendingRequest.originalTitle = normalizeText(pendingRequest.originalTitle) || normalizeText(pendingRequest.title);
    pendingRequest.originalBody = normalizeText(pendingRequest.originalBody) || normalizeText(pendingRequest.body);
    pendingRequest.originalEmailSubject = normalizeText(pendingRequest.originalEmailSubject) || normalizeText(pendingRequest.emailSubject);
    pendingRequest.title = nextTitle;
    pendingRequest.body = nextBody;
    pendingRequest.emailSubject = nextEmailSubject;
    pendingRequest.audienceType = nextAudienceType;
    pendingRequest.gradeTargets = nextGradeTargets;
    pendingRequest.courseTargets = nextCourseTargets;
    pendingRequest.parentTargets = nextAudienceType === 'individual' ? audience.parentIds : [];
    pendingRequest.studentTargets = audience.studentIds;
    pendingRequest.media = normalizedMedia;
    pendingRequest.reviewNotes = reviewNotes;
    pendingRequest.status = 'approved';
    pendingRequest.reviewedAt = new Date();
    pendingRequest.reviewedByUserId = userId;
    pendingRequest.reviewedByName = name;
    pendingRequest.publishedCommunicationId = communication._id;
    await pendingRequest.save();

    return res.status(200).json({
      request: serializeCommunicationRequest(pendingRequest.toObject()),
      communication,
      deliverySummary,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/communication-requests/:id/reject', async (req, res) => {
  try {
    const { schoolId, userId, name } = req.user;
    const requestId = toObjectId(req.params.id);
    const reviewNotes = normalizeText(req.body?.reviewNotes);

    if (!requestId) {
      return res.status(400).json({ message: 'Invalid request id.' });
    }

    const pendingRequest = await AcademicCommunicationRequest.findOne({
      _id: requestId,
      schoolId,
      status: 'pending',
    });

    if (!pendingRequest) {
      return res.status(404).json({ message: 'Solicitud no encontrada o ya procesada.' });
    }

    pendingRequest.status = 'rejected';
    pendingRequest.reviewNotes = reviewNotes;
    pendingRequest.reviewedAt = new Date();
    pendingRequest.reviewedByUserId = userId;
    pendingRequest.reviewedByName = name;
    await pendingRequest.save();

    return res.status(200).json({ request: serializeCommunicationRequest(pendingRequest.toObject()) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/enrollments', async (req, res) => {
  try {
    const { schoolId, userId, role } = req.user;
    const {
      father = {},
      mother = {},
      primaryGuardian = 'mother',
      students = [],
      schoolName = 'Comergio',
    } = req.body || {};

    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ message: 'students is required' });
    }

    const createdParents = [];
    const linkedParents = [];
    for (const parentEntry of [{ data: father, relationship: 'father' }, { data: mother, relationship: 'mother' }]) {
      const result = await upsertParentAccount({ schoolId, parentData: parentEntry.data, relationship: parentEntry.relationship });
      if (result) {
        linkedParents.push({ ...result, relationship: parentEntry.relationship });
        if (result.created) {
          createdParents.push({
            _id: result.user._id,
            name: result.user.name,
            username: result.user.username,
            temporaryPassword: result.temporaryPassword,
            relationship: parentEntry.relationship,
          });
        }
      }
    }

    if (!linkedParents.length) {
      return res.status(400).json({ message: 'Debes registrar al menos un acudiente.' });
    }

    const distinctGrades = Array.from(new Set(students.map((student) => normalizeText(student?.grade)).filter(Boolean)));
    const feeConfiguration = await ensureAcademicFeeConfiguration(schoolId, distinctGrades);
    const academicStructure = await ensureAcademicStructureConfiguration(schoolId);
    const structureGrades = Array.isArray(academicStructure?.grades) ? academicStructure.grades : [];

    const primaryRelationship = ['father', 'mother'].includes(normalizeText(primaryGuardian).toLowerCase())
      ? normalizeText(primaryGuardian).toLowerCase()
      : '';

    const createdStudents = [];
    const enrolledStudentIds = new Set();
    for (const rawStudent of students) {
      const firstName = normalizeText(rawStudent?.firstName);
      const lastName = normalizeText(rawStudent?.lastName);
      const studentName = normalizeText(`${firstName} ${lastName}`);
      if (!studentName) {
        continue;
      }

      const medicalProfile = normalizeAcademicStudentMedicalProfile(rawStudent?.medicalProfile);
      const medicalProfileErrors = getAcademicStudentMedicalProfileErrors(medicalProfile, studentName || `Alumno ${createdStudents.length + 1}`);
      if (medicalProfileErrors.length) {
        return res.status(400).json({ message: medicalProfileErrors[0], errors: medicalProfileErrors });
      }

      const grade = resolveAcademicStructureGradeKey(rawStudent?.grade, structureGrades);
      const entryDate = parseAcademicCalendarDate(rawStudent?.entryDate);
      const gradeFeeSetting = findGradeFeeSetting(feeConfiguration, grade);
      const benefitRules = resolveAcademicFeeBenefitRules(feeConfiguration, gradeFeeSetting);
      const enrollmentBonusInstallments = normalizeAcademicInstallmentCount(rawStudent?.enrollmentBonusInstallments, 1);
      const annualTuitionInstallments = normalizeAcademicInstallmentCount(rawStudent?.annualTuitionInstallments, 1);
      const annualTuitionAdditionalDiscountPercent = normalizeAcademicAdditionalDiscountPercent(rawStudent?.annualTuitionAdditionalDiscountPercent);
      const annualTuitionAdditionalDiscountLabel = normalizeText(rawStudent?.annualTuitionAdditionalDiscountLabel);
      const monthlyTuitionAdditionalDiscountPercent = normalizeAcademicAdditionalDiscountPercent(rawStudent?.monthlyTuitionAdditionalDiscountPercent);
      const monthlyTuitionAdditionalDiscountLabel = normalizeText(rawStudent?.monthlyTuitionAdditionalDiscountLabel);
      const initialEnrollmentAndFirstTuitionPaid = false;
      const enrollmentPricing = calculateProratedAcademicEnrollmentFee(gradeFeeSetting?.enrollmentFee || 0, entryDate, feeConfiguration, grade);
      const proratedAnnualTuitionAmount = Number(enrollmentPricing.amount || 0);
      const annualTuitionAdditionalDiscountAmount = Math.max(0, Math.round(proratedAnnualTuitionAmount * (annualTuitionAdditionalDiscountPercent / 100)));
      const discountedAnnualTuitionAmount = Math.max(0, proratedAnnualTuitionAmount - annualTuitionAdditionalDiscountAmount);
      const chargeReferenceDate = entryDate && !Number.isNaN(entryDate.getTime()) ? entryDate : new Date();
      const annualTuitionDueDate = resolveAcademicAnnualTuitionFirstDueDate({
        feeConfiguration,
        grade,
        fallbackDate: chargeReferenceDate,
        referenceDate: new Date(),
        enrollmentPricing,
      });

      let student = await findExistingEnrollmentStudent({ schoolId, rawStudent, linkedParents });
      const hadExistingStudent = Boolean(student);

      if (!student) {
        student = await Student.create({
          schoolId,
          name: studentName,
          firstName,
          lastName,
          grade,
          course: normalizeText(rawStudent?.course),
          schoolCode: normalizeText(rawStudent?.schoolCode),
          gender: normalizeText(rawStudent?.gender),
          documentType: normalizeText(rawStudent?.documentType),
          documentNumber: normalizeText(rawStudent?.documentNumber),
          birthDate: rawStudent?.birthDate ? new Date(rawStudent.birthDate) : null,
          entryDate: entryDate && !Number.isNaN(entryDate.getTime()) ? entryDate : null,
          bloodType: normalizeText(rawStudent?.bloodType),
          medicalProfile,
          birthPlace: normalizeText(rawStudent?.birthPlace),
          address: normalizeText(rawStudent?.address),
          status: 'active',
        });
      }

      await ensureStudentWallet({ schoolId, studentId: student._id });

      try {
        await upsertStudentAccount({ schoolId, student });
      } catch (accountError) {
        console.warn('[STUDENT_ACCOUNT_UPSERT_ERROR]', accountError?.message || accountError);
      }

      let billingProfile = await StudentBillingProfile.findOne({ schoolId, studentId: student._id });
      const hadBillingProfile = Boolean(billingProfile);
      if (!billingProfile) {
        billingProfile = new StudentBillingProfile({ schoolId, studentId: student._id });
      }
      billingProfile.grade = grade;
      billingProfile.academicYear = normalizeText(feeConfiguration?.academicYear) || getCurrentAcademicYear();
      billingProfile.entryDate = entryDate && !Number.isNaN(entryDate.getTime()) ? entryDate : null;
      billingProfile.enrollmentBonusAmount = Number(gradeFeeSetting?.enrollmentBonus || 0);
      billingProfile.enrollmentBonusInstallments = enrollmentBonusInstallments;
      billingProfile.annualTuitionAmount = discountedAnnualTuitionAmount;
      billingProfile.annualTuitionInstallments = annualTuitionInstallments;
      billingProfile.annualTuitionDueDate = annualTuitionDueDate;
      billingProfile.annualTuitionBaseAmount = enrollmentPricing.baseAmount;
      billingProfile.annualTuitionDiscountAmount = enrollmentPricing.enrollmentBenefitDiscountAmount;
      billingProfile.annualTuitionBenefitLabel = enrollmentPricing.enrollmentBenefitLabel;
      billingProfile.annualTuitionAdditionalDiscountPercent = annualTuitionAdditionalDiscountPercent;
      billingProfile.annualTuitionAdditionalDiscountAmount = annualTuitionAdditionalDiscountAmount;
      billingProfile.annualTuitionAdditionalDiscountLabel = annualTuitionAdditionalDiscountLabel;
      billingProfile.monthlyTuitionAmount = Number(gradeFeeSetting?.monthlyTuition || 0);
      billingProfile.initialEnrollmentAndFirstTuitionPaid = initialEnrollmentAndFirstTuitionPaid;
      billingProfile.monthlyTuitionAdditionalDiscountPercent = monthlyTuitionAdditionalDiscountPercent;
      billingProfile.monthlyTuitionAdditionalDiscountLabel = monthlyTuitionAdditionalDiscountLabel;
      billingProfile.dueDay = DEFAULT_ACADEMIC_MONTHLY_DUE_DAY;
      billingProfile.benefitRules = benefitRules;
      billingProfile.active = true;
      await billingProfile.save();

      const resolvedPrimaryParent = linkedParents.find((item) => item.relationship === primaryRelationship) || linkedParents[0];

      for (const parentRecord of linkedParents) {
        await ParentStudentLink.findOneAndUpdate(
          { schoolId, parentId: parentRecord.user._id, studentId: student._id },
          {
            schoolId,
            parentId: parentRecord.user._id,
            studentId: student._id,
            relationship: parentRecord.relationship,
            isPrimaryContact: String(parentRecord.user._id) === String(resolvedPrimaryParent?.user?._id || ''),
            status: 'active',
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      }

      const existingEnrollmentChargeCount = hadExistingStudent || hadBillingProfile
        ? await AcademicCharge.countDocuments({ schoolId, studentId: student._id, category: 'monthly_statement', status: { $ne: 'cancelled' } })
        : 0;
      const shouldCreateEnrollmentCharges = existingEnrollmentChargeCount === 0;

      if (resolvedPrimaryParent && shouldCreateEnrollmentCharges) {
        const { ensureConsolidatedMonthlyCharge } = require('../services/academicConsolidatedBilling.service');
        const academicStructure = await ensureAcademicStructureConfiguration(schoolId);
        const academicGrades = (Array.isArray(academicStructure?.grades) ? academicStructure.grades : [])
          .filter((gradeItem) => normalizeText(gradeItem?.status || 'active') !== 'archived')
          .map((gradeItem) => ({ key: normalizeText(gradeItem.key), levelKey: normalizeText(gradeItem.levelKey) }));

        await ensureConsolidatedMonthlyCharge({
          schoolId,
          studentId: student._id,
          billingProfile: billingProfile.toObject ? billingProfile.toObject() : billingProfile,
          feeConfiguration: feeConfiguration.toObject ? feeConfiguration.toObject() : feeConfiguration,
          academicGrades,
          createdByUserId: userId,
          createdByRole: role,
          parentId: resolvedPrimaryParent.user._id,
          referenceDate: chargeReferenceDate,
          sendNotification: true,
          schoolName,
          audienceType: 'enrollment',
        });
      }

      const studentIdKey = String(student._id);
      if (!enrolledStudentIds.has(studentIdKey)) {
        enrolledStudentIds.add(studentIdKey);
        createdStudents.push({
          _id: student._id,
          name: student.name,
          firstName: student.firstName,
          lastName: student.lastName,
          grade: student.grade,
          course: student.course,
        });
      }
    }

    const charges = await AcademicCharge.find({ schoolId, studentId: { $in: createdStudents.map((student) => student._id) } })
      .populate('studentId', 'name')
      .lean();

    const parentEmails = linkedParents.filter((record) => normalizeEmail(record.user.email));
    if (parentEmails.length && charges.length) {
      await dispatchBillingNotice({
        schoolId,
        schoolName,
        parents: parentEmails.map((record) => record.user),
        title: 'Nueva matrícula registrada',
        intro: 'Se registró la matrícula del alumno y ya tienes los cargos iniciales disponibles en la app.',
        charges: charges.map((charge) => ({
          ...charge,
          studentName: charge.studentId?.name || 'Alumno',
        })),
        pushTitle: 'Matrícula registrada',
        pushBody: 'Ya puedes pagar el cobro mensual consolidado en la app.',
        payload: { type: 'academic.billing.enrollment', url: buildParentPushUrl('academic.billing.enrollment') },
      });
    }

    return res.status(201).json({
      parents: linkedParents.map((record) => ({
        _id: record.user._id,
        name: record.user.name,
        username: record.user.username,
        relationship: record.relationship,
      })),
      createdParents,
      students: createdStudents,
      chargesCreated: charges.length,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/billing', async (req, res) => {
  try {
    const { schoolId } = req.user;
    return res.status(200).json(await buildBillingSummary(schoolId));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.patch('/billing/students/:studentId/pension-discount', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const studentId = String(req.params.studentId || '').trim();
    if (!studentId) {
      return res.status(400).json({ message: 'studentId is required' });
    }

    const student = await Student.findOne({ _id: studentId, schoolId, deletedAt: null }).select('_id name').lean();
    if (!student) {
      return res.status(404).json({ message: 'No se encontró el alumno.' });
    }

    const discountType = normalizeText(req.body?.discountType) === 'fixed' ? 'fixed' : 'percent';
    const discountLabel = normalizeText(req.body?.discountLabel || req.body?.monthlyTuitionAdditionalDiscountLabel);
    const discountPercent = normalizeAcademicAdditionalDiscountPercent(
      req.body?.discountPercent ?? req.body?.monthlyTuitionAdditionalDiscountPercent,
    );
    const discountFixedAmount = Math.max(0, Number(
      req.body?.discountFixedAmount ?? req.body?.monthlyTuitionAdditionalDiscountFixedAmount ?? 0,
    ));

    if (!discountLabel) {
      return res.status(400).json({ message: 'El motivo del descuento es obligatorio.' });
    }
    if (discountType === 'percent' && discountPercent <= 0) {
      return res.status(400).json({ message: 'Indica un porcentaje mayor a 0 o usa un valor fijo.' });
    }
    if (discountType === 'fixed' && discountFixedAmount <= 0) {
      return res.status(400).json({ message: 'Indica un valor fijo mayor a 0 o usa un porcentaje.' });
    }

    let billingProfile = await StudentBillingProfile.findOne({ schoolId, studentId });
    if (!billingProfile) {
      const feeConfiguration = await ensureAcademicFeeConfiguration(schoolId, [student.grade].filter(Boolean));
      const gradeFeeSetting = findGradeFeeSetting(feeConfiguration, student.grade);
      billingProfile = new StudentBillingProfile({
        schoolId,
        studentId,
        grade: student.grade || '',
        academicYear: normalizeText(feeConfiguration?.academicYear) || getCurrentAcademicYear(),
        monthlyTuitionAmount: Number(gradeFeeSetting?.monthlyTuition || 0),
        active: true,
      });
    }

    billingProfile.monthlyTuitionAdditionalDiscountType = discountType;
    billingProfile.monthlyTuitionAdditionalDiscountPercent = discountType === 'percent' ? discountPercent : 0;
    billingProfile.monthlyTuitionAdditionalDiscountFixedAmount = discountType === 'fixed' ? discountFixedAmount : 0;
    billingProfile.monthlyTuitionAdditionalDiscountLabel = discountLabel;
    await billingProfile.save();

    const { refreshPendingIndividualTuitionCharges } = require('../services/academicConsolidatedBilling.service');
    await refreshPendingIndividualTuitionCharges({
      schoolId,
      studentIds: [studentId],
    }).catch((syncError) => {
      console.warn(`[PENSION_DISCOUNT_CHARGE_REFRESH] studentId=${studentId} error=${syncError.message}`);
    });

    return res.status(200).json({
      message: 'Descuento de pensión actualizado.',
      billing: await buildBillingSummary(schoolId),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/billing/charges', async (req, res) => {
  try {
    const { schoolId, userId, role } = req.user;
    const {
      concept,
      description = '',
      amount,
      originalAmount = null,
      dueDate,
      audienceType,
      category = 'additional',
      monthKey = '',
      suppressNotice = false,
      gradeTargets = [],
      courseTargets = [],
      parentTargets = [],
      studentTargets = [],
      schoolName = 'Comergio',
    } = req.body || {};

    if (!normalizeText(concept) || Number(amount || 0) <= 0 || !dueDate) {
      return res.status(400).json({ message: 'concept, amount and dueDate are required' });
    }

    const audience = await resolveAudienceMembers({ schoolId, audienceType, gradeTargets, courseTargets, parentTargets, studentTargets });
    if (!audience.parents.length) {
      return res.status(400).json({ message: 'No se encontraron acudientes para el cobro.' });
    }

    const links = audience.studentIds.length > 0
      ? await ParentStudentLink.find({ schoolId, studentId: { $in: audience.studentIds }, status: 'active' }).lean()
      : [];
    const studentMap = new Map(audience.students.map((student) => [String(student._id), student]));
    const normalizedCategory = ['enrollment_bonus', 'annual_tuition', 'monthly_tuition', 'additional'].includes(normalizeText(category)) ? normalizeText(category) : 'additional';
    const billingProfilesByStudentId = normalizedCategory === 'monthly_tuition' && audience.studentIds.length > 0
      ? new Map((await StudentBillingProfile.find({ schoolId, studentId: { $in: audience.studentIds } }).lean()).map((profile) => [String(profile.studentId || ''), profile]))
      : new Map();
    const createdCharges = [];

    if (links.length > 0) {
      for (const link of links) {
        const student = studentMap.get(String(link.studentId));
        const billingProfile = billingProfilesByStudentId.get(String(link.studentId || '')) || null;
        const existingMonthlyCharge = normalizedCategory === 'monthly_tuition' && normalizeText(monthKey)
          ? await AcademicCharge.findOne({ schoolId, studentId: link.studentId, category: 'monthly_tuition', monthKey: normalizeText(monthKey), status: { $ne: 'cancelled' } })
          : null;
        if (existingMonthlyCharge) {
          createdCharges.push(existingMonthlyCharge);
          continue;
        }

        createdCharges.push(await createCharge({
          schoolId,
          createdByUserId: userId,
          createdByRole: role,
          parentId: link.parentId,
          studentId: link.studentId,
          billingProfileId: billingProfile?._id || null,
          category: normalizedCategory,
          concept: normalizeText(concept),
          description: normalizeText(description),
          amount,
          originalAmount: normalizedCategory === 'monthly_tuition' && !billingProfile ? amount : originalAmount,
          dueDate,
          audienceType: normalizeText(audienceType) || 'individual',
          targetGrade: student?.grade || '',
          targetCourse: student?.course || '',
          monthKey: normalizeText(monthKey),
        }));
      }
    } else {
      for (const parent of audience.parents) {
        createdCharges.push(await createCharge({
          schoolId,
          createdByUserId: userId,
          createdByRole: role,
          parentId: parent._id,
          category: normalizedCategory,
          concept: normalizeText(concept),
          description: normalizeText(description),
          amount,
          originalAmount,
          dueDate,
          audienceType: normalizeText(audienceType) || 'individual',
          monthKey: normalizeText(monthKey),
        }));
      }
    }

    if (!suppressNotice) {
      await dispatchBillingNotice({
        schoolId,
        schoolName,
        parents: audience.parents,
        title: `Nuevo cobro: ${normalizeText(concept)}`,
        intro: 'Se registró un nuevo cobro académico para tu familia.',
        charges: createdCharges.map((charge) => {
          const student = studentMap.get(String(charge.studentId || ''));
          return {
            ...charge.toObject(),
            parentId: charge.parentId,
            studentName: student?.name || 'Familia',
            amount: charge.amount,
            dueDate: charge.dueDate,
            concept: charge.concept,
          };
        }),
        pushTitle: 'Nuevo cobro académico',
        pushBody: `${normalizeText(concept)} por ${formatCurrency(amount)} ya está disponible en tu sección de pagos.`,
        payload: { type: 'academic.billing.charge_created', url: buildParentPushUrl('academic.billing.charge_created') },
      });
    }

    return res.status(201).json({ createdCharges: createdCharges.length, charges: createdCharges.map((charge) => ({ _id: charge._id, id: charge._id })) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/billing/charges/:chargeId/pay', async (req, res) => {
  try {
    const { schoolId, userId, role } = req.user;
    const chargeId = toObjectId(req.params.chargeId);
    if (!chargeId) {
      return res.status(400).json({ message: 'chargeId no es válido.' });
    }

    const charge = await AcademicCharge.findOne({
      _id: chargeId,
      schoolId,
      status: { $in: ['pending', 'overdue'] },
    });

    if (!charge) {
      return res.status(404).json({ message: 'El cargo no existe o ya está pagado.' });
    }

    if (isMillenniumSchoolId(schoolId) && String(charge.category || '') === 'annual_tuition') {
      const contractMode = normalizeText(req.body?.enrollmentContractMode).toLowerCase();
      if (!['physical', 'digital', 'fisico', 'contrato_fisico', 'contrato fisico', 'contrato_digital', 'contrato digital'].includes(contractMode)) {
        return res.status(400).json({ message: 'Selecciona si el contrato de matrícula es físico o digital.' });
      }
    }

    const paidAt = req.body?.paidAt ? new Date(req.body.paidAt) : new Date();
    if (Number.isNaN(paidAt.getTime())) {
      return res.status(400).json({ message: 'La fecha de pago no es válida.' });
    }

    const { outstandingAmount } = await getAcademicChargeOutstandingAmount(charge, resolveAcademicChargePaymentReferenceDate(charge, paidAt));
    if (outstandingAmount <= 0) {
      charge.status = 'paid';
      charge.paidAt = charge.paidAt || new Date();
      await charge.save();
      return res.status(409).json({ message: 'Este cargo ya no tiene saldo pendiente.' });
    }

    const settleAsPaid = Boolean(req.body?.settleAsPaid);
    const requestedAmount = Number(req.body?.amount || outstandingAmount);
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      return res.status(400).json({ message: 'Ingresa un valor de pago válido.' });
    }

    const paymentAmount = settleAsPaid
      ? Math.round(requestedAmount)
      : Math.min(Math.round(requestedAmount), Math.round(outstandingAmount));

    const primaryParent = String(charge.studentId || '').trim()
      ? (await resolvePrimaryParentContacts(schoolId)).get(String(charge.studentId))
      : null;
    const parentId = primaryParent?._id || charge.parentId;
    const method = normalizeAcademicManualPaymentMethod(req.body?.method);
    const payment = await AcademicChargePayment.create({
      schoolId,
      chargeId: charge._id,
      studentId: charge.studentId || null,
      parentId,
      recordedByUserId: userId,
      recordedByRole: role,
      amount: paymentAmount,
      method,
      notes: normalizeText(req.body?.notes),
      paidAt,
    });

    const remainingAmount = settleAsPaid ? 0 : Math.max(0, outstandingAmount - paymentAmount);
    if (settleAsPaid) {
      charge.amount = paymentAmount;
      charge.status = 'paid';
      charge.paidAt = payment.paidAt;
    } else if (remainingAmount <= 0) {
      charge.status = 'paid';
      charge.paidAt = payment.paidAt;
    } else if (new Date(charge.dueDate) < new Date()) {
      charge.status = 'overdue';
    } else {
      charge.status = 'pending';
    }
    charge.paymentMethod = method;
    await charge.save();

    if (isMillenniumSchoolId(schoolId) && String(charge.category || '') === 'annual_tuition') {
      await linkCarteraPaymentToEnrollmentMatricula({
        schoolId,
        charge,
        chargePayment: payment,
        contractMode: req.body?.enrollmentContractMode,
        recordedByUserId: userId,
        recordedByRole: role,
      });
    }

    queueNotificationsForParents({
      schoolId,
      parentIds: [parentId],
      studentId: charge.studentId,
      title: 'Pago academico registrado',
      body: `Se registró un pago de ${formatCurrency(payment.amount)} por ${normalizeText(charge.concept) || 'un cobro academico'}.`,
      payload: {
        type: 'academic.billing.payment_registered',
        chargeId: String(charge._id),
        paymentId: String(payment._id),
        amount: payment.amount,
        url: buildParentPushUrl('academic.billing.payment_registered', { studentId: charge.studentId }),
      },
    }).catch((error) => console.warn(`[ACADEMIC_PAYMENT_NOTIFY_WARNING] payment=${payment._id} error=${error.message}`));

    return res.status(200).json({
      message: 'Pago registrado con éxito.',
      payment,
      remainingAmount,
      chargeStatus: charge.status,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

function getBogotaTodayDateInput(referenceDate = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(referenceDate);
}

function parseBillingPaymentDateFilter(value, { endOfDay = false } = {}) {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00-05:00`);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) {
    return new Date(date.getTime() + (24 * 60 * 60 * 1000) - 1);
  }
  return date;
}

router.get('/billing/payments', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const studentId = toObjectId(req.query.studentId);
    const today = getBogotaTodayDateInput();
    const dateFrom = parseBillingPaymentDateFilter(req.query.dateFrom || today);
    const dateTo = parseBillingPaymentDateFilter(req.query.dateTo || req.query.dateFrom || today, { endOfDay: true });

    if (!dateFrom || !dateTo) {
      return res.status(400).json({ message: 'Las fechas del filtro no son válidas.' });
    }

    const filter = {
      schoolId,
      paidAt: {
        $gte: dateFrom,
        $lte: dateTo,
      },
    };
    if (studentId) {
      filter.studentId = studentId;
    }

    const [payments, primaryParentByStudentId] = await Promise.all([
      AcademicChargePayment.find(filter)
        .populate('chargeId', 'concept category')
        .populate('studentId', 'name grade course documentNumber')
        .populate('parentId', 'name phone email')
        .sort({ paidAt: -1, createdAt: -1 })
        .limit(500)
        .lean(),
      resolvePrimaryParentContacts(schoolId),
    ]);

    return res.status(200).json({
      payments: payments.map((payment) => {
        const studentKey = String(payment.studentId?._id || payment.studentId || '').trim();
        const primaryParent = studentKey ? primaryParentByStudentId.get(studentKey) || null : null;
        return {
          _id: payment._id,
          chargeId: payment.chargeId?._id || payment.chargeId || null,
          studentId: studentKey || null,
          studentName: payment.studentId?.name || 'Familia',
          documentNumber: payment.studentId?.documentNumber || '',
          grade: payment.studentId?.grade || '',
          course: payment.studentId?.course || '',
          parentId: primaryParent?._id || payment.parentId?._id || payment.parentId || null,
          parentName: primaryParent?.name || payment.parentId?.name || 'Acudiente',
          parentPhone: primaryParent?.phone || payment.parentId?.phone || '',
          concept: payment.chargeId?.concept || payment.notes || 'Pago académico',
          category: payment.chargeId?.category || '',
          amount: Number(payment.amount || 0),
          method: payment.method || '',
          methodLabel: labelAcademicPaymentMethod(payment.method),
          notes: payment.notes || '',
          paidAt: payment.paidAt || payment.createdAt,
          recordedByRole: payment.recordedByRole || '',
        };
      }),
      filters: {
        dateFrom: req.query.dateFrom || today,
        dateTo: req.query.dateTo || req.query.dateFrom || today,
        studentId: studentId ? String(studentId) : '',
      },
      total: payments.length,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.delete('/billing/payments/:paymentId', async (req, res) => {
  return res.status(409).json({
    message: 'Los pagos deben anularse mediante solicitud autorizada por Rectoría.',
  });
});

router.post('/billing/payments/:paymentId/deletion-request', async (req, res) => {
  try {
    const { schoolId, userId, role, name } = req.user;
    const paymentId = toObjectId(req.params.paymentId);
    if (!paymentId) {
      return res.status(400).json({ message: 'paymentId no es válido.' });
    }

    const request = await createBillingPaymentDeletionRequest({
      schoolId,
      userId,
      userRole: role,
      userName: name,
      paymentId,
    });

    const billing = await buildBillingSummary(schoolId);
    return res.status(201).json({
      message: 'Solicitud enviada a Rectoría para autorización.',
      request,
      billing,
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ message: error.message });
  }
});

router.post('/billing/reminders', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { bucket = '', parentIds = [], schoolName = 'Comergio' } = req.body || {};
    const billing = await buildBillingSummary(schoolId);

    let targetParentIds = normalizeArray(parentIds);
    if (!targetParentIds.length && bucket) {
      targetParentIds = billing.overdueParents
        .filter((parent) => String(parent.bucket) === String(bucket))
        .map((parent) => String(parent.parentId));
    }

    if (!targetParentIds.length) {
      return res.status(400).json({ message: 'No se encontraron acudientes para el recordatorio.' });
    }

    const parents = await User.find({ schoolId, _id: { $in: targetParentIds }, role: 'parent', deletedAt: null }).select('name email').lean();
    const charges = billing.charges.filter((charge) => targetParentIds.includes(String(charge.parentId?._id || charge.parentId)));

    const delivery = await dispatchBillingNotice({
      schoolId,
      schoolName,
      parents,
      title: 'Recordatorio de cartera académica',
      intro: 'Estos cargos siguen pendientes y requieren gestión desde la app del acudiente.',
      charges: charges.map((charge) => ({
        parentId: charge.parentId?._id || charge.parentId,
        studentName: charge.studentName,
        concept: charge.concept,
        dueDate: charge.dueDate,
        amount: charge.amount,
      })),
      pushTitle: 'Tienes pagos académicos pendientes',
      pushBody: 'Revisa tu cartera académica y ponte al día desde la app.',
      payload: { type: 'academic.billing.reminder', url: buildParentPushUrl('academic.billing.reminder') },
    });

    return res.status(200).json({ delivery, parentsNotified: parents.length });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/billing/follow-ups', async (req, res) => {
  try {
    const { schoolId, userId, role } = req.user;
    const {
      actionType,
      parentId,
      parentName = '',
      parentPhone = '',
      studentNames = [],
      outstandingAmount = 0,
      overdueDays = 0,
      overdueMonths = 0,
      title = '',
      body = '',
      whatsappUrl = '',
      schoolName = 'Comergio',
    } = req.body || {};

    const normalizedActionType = normalizeText(actionType).toLowerCase();
    if (!['push_email', 'whatsapp', 'manual_note'].includes(normalizedActionType)) {
      return res.status(400).json({ message: 'actionType no es válido.' });
    }

    if (!parentId) {
      return res.status(400).json({ message: 'parentId es requerido.' });
    }

    const parent = await User.findOne({ schoolId, _id: parentId, role: 'parent', deletedAt: null })
      .select('name email phone')
      .lean();
    if (!parent) {
      return res.status(404).json({ message: 'No se encontró el acudiente.' });
    }

    const actor = await User.findOne({ schoolId, _id: userId }).select('name').lean();
    let pushDelivered = 0;
    let pushTokensFound = 0;
    let emailed = 0;

    if (normalizedActionType === 'push_email') {
      const safeTitle = normalizeText(title);
      const safeBody = normalizeText(body);
      if (!safeTitle || !safeBody) {
        return res.status(400).json({ message: 'El título y el mensaje son obligatorios.' });
      }

      const pushResult = await queueNotificationsForParents({
        schoolId,
        parentIds: [parent._id],
        title: safeTitle,
        body: safeBody,
        payload: { type: 'academic.billing.follow_up', url: buildParentPushUrl('academic.billing.follow_up') },
      });
      pushDelivered = Number(pushResult?.directDelivery?.delivered || 0);
      pushTokensFound = Number(pushResult?.tokensFound || 0);

      if (ACADEMIC_COMMUNICATION_EMAIL_DELIVERY_ENABLED && normalizeEmail(parent.email)) {
        try {
          await sendAcademicCommunicationEmail({
            toEmail: parent.email,
            toName: parent.name,
            schoolName,
            title: safeTitle,
            body: safeBody,
            authorName: actor?.name || role,
          });
          emailed = 1;
        } catch (error) {
          console.warn(`[ACADEMIC_BILLING_FOLLOWUP_EMAIL_FAILED] parentId=${parent._id} error=${error.message}`);
        }
      }
    }

    const safeWhatsappUrl = normalizeText(whatsappUrl) || (normalizePhoneForWhatsapp(parentPhone || parent.phone)
      ? `https://wa.me/${normalizePhoneForWhatsapp(parentPhone || parent.phone)}`
      : '');

    const followUp = await AcademicBillingFollowUp.create({
      schoolId,
      parentId: parent._id,
      parentName: normalizeText(parentName) || parent.name || 'Acudiente',
      parentPhone: normalizeText(parentPhone) || parent.phone || '',
      studentNames: normalizeArray(studentNames),
      outstandingAmount: Number(outstandingAmount || 0),
      overdueDays: Number(overdueDays || 0),
      overdueMonths: Number(overdueMonths || 0),
      actionType: normalizedActionType,
      title: normalizeText(title),
      body: normalizeText(body),
      whatsappUrl: safeWhatsappUrl,
      pushDelivered,
      pushTokensFound,
      emailed,
      createdByUserId: userId,
      createdByRole: role,
      createdByName: actor?.name || '',
    });

    return res.status(201).json({ followUp: serializeBillingFollowUp(followUp), pushDelivered, pushTokensFound, emailed });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;