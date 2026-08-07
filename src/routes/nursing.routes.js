const express = require('express');
const mongoose = require('mongoose');

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const AcademicStructure = require('../models/academicStructure.model');
const NursingVisit = require('../models/nursingVisit.model');
const ParentStudentLink = require('../models/parentStudentLink.model');
const Student = require('../models/student.model');
const User = require('../models/user.model');
const { queueNotificationsForParents, notifySchoolStaffRoles } = require('../services/notification.service');
const { buildParentPushUrl } = require('../utils/parentPushTargets');
const {
  serializeStudentMedicalProfile,
  listStudentMedicalProfileRevisions,
} = require('../services/studentMedicalProfile.service');
const {
  uploadImageMiddleware,
  processAndStoreUploadedImage,
  isCloudinaryEnabled,
  normalizeStoredImageUrl,
} = require('../utils/imageUpload');

const router = express.Router();

router.use(authMiddleware);

const nursingStaffRoles = ['nursing', 'admin', 'rectoria', 'direccion'];
const nursingSummaryViewerRoles = ['nursing', 'admin', 'rectoria', 'direccion', 'coordination'];
const MAX_NURSING_VISIT_PHOTOS = 6;

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ''));
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeLookup(value) {
  return normalizeText(value).replace(/\s+/g, '').toLowerCase();
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function firstName(name) {
  return normalizeText(name).split(/\s+/)[0] || 'El alumno';
}

function serializeGuardian(link) {
  const parent = link?.parentId || {};
  const email = normalizeText(parent.email).toLowerCase()
    || (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeText(parent.username))
      ? normalizeText(parent.username).toLowerCase()
      : '');

  return {
    id: String(parent._id || ''),
    name: normalizeText(parent.name),
    username: normalizeText(parent.username),
    phone: normalizeText(parent.phone),
    email,
    relationship: normalizeText(link?.relationship) || 'Acudiente',
    isPrimaryContact: Boolean(link?.isPrimaryContact),
  };
}

function normalizeVisitPhotos(value) {
  let raw = value;
  if (typeof value === 'string') {
    try {
      raw = JSON.parse(value);
    } catch {
      raw = [];
    }
  }

  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .slice(0, MAX_NURSING_VISIT_PHOTOS)
    .map((item) => {
      const url = normalizeStoredImageUrl(item?.url || item?.src || item);
      if (!url) {
        return null;
      }
      return {
        url,
        thumbUrl: normalizeStoredImageUrl(item?.thumbUrl || url),
        alt: normalizeText(item?.alt),
      };
    })
    .filter(Boolean);
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

function getStudentGradeCandidates(student = {}) {
  const courseParts = normalizeText(student.course).split(':').map((part) => part.trim()).filter(Boolean);
  const gradeKeyFromCourse = courseParts.length >= 2 ? `${courseParts[0].toLowerCase()}:${courseParts[1]}` : '';

  return Array.from(new Set([
    normalizeLookup(student.grade),
    normalizeLookup(gradeKeyFromCourse),
  ].filter(Boolean)));
}

function buildAcademicCourseAliases(grade = {}, course = {}, siblingCourses = []) {
  const courseKey = normalizeText(course.key);
  const courseKeyParts = courseKey.split(':').map((part) => part.trim()).filter(Boolean);

  return Array.from(new Set([
    courseKey,
    course.label,
    course.section,
    buildAcademicCourseDisplayLabel(grade, course, siblingCourses),
    getAcademicCourseSectionFromKey(courseKey),
    courseKeyParts.slice(-1).join(':'),
    courseKeyParts.slice(-2).join(':'),
  ].map(normalizeLookup).filter(Boolean)));
}

function resolveStudentDisplayGrade(student = {}, academicStructure = null) {
  const grade = normalizeText(student.grade);
  const courseValue = normalizeText(student.course);
  const fallback = grade || 'Sin grado';

  if (!courseValue) {
    return fallback;
  }

  const courseParts = courseValue.split(':').map((part) => part.trim()).filter(Boolean);
  const courseCandidates = Array.from(new Set([
    courseValue,
    courseParts.slice(-1).join(':'),
    courseParts.slice(-2).join(':'),
  ].map(normalizeLookup).filter(Boolean)));
  const gradeCandidates = getStudentGradeCandidates(student);

  if (academicStructure && gradeCandidates.length > 0 && courseCandidates.length > 0) {
    const matchedGrade = (Array.isArray(academicStructure.grades) ? academicStructure.grades : []).find((item) => {
      const normalizedGradeKey = normalizeLookup(item?.key);
      const normalizedGradeLabel = normalizeLookup(item?.label);
      return gradeCandidates.includes(normalizedGradeKey) || gradeCandidates.includes(normalizedGradeLabel);
    });

    if (matchedGrade) {
      const siblingCourses = Array.isArray(matchedGrade.courses) ? matchedGrade.courses : [];
      const matchedCourse = siblingCourses.find((item) => {
        const aliases = buildAcademicCourseAliases(matchedGrade, item, siblingCourses);
        return aliases.some((alias) => courseCandidates.includes(alias));
      });

      if (matchedCourse) {
        return buildAcademicCourseDisplayLabel(matchedGrade, matchedCourse, siblingCourses) || fallback;
      }
    }
  }

  if (courseValue.includes(':')) {
    return fallback;
  }

  return courseValue || fallback;
}

function buildStudentSearchTerms(student = {}, academicStructure = null) {
  const displayGrade = resolveStudentDisplayGrade(student, academicStructure);

  return Array.from(new Set([
    student.name,
    student.schoolCode,
    student.documentNumber,
    student.grade,
    student.course,
    displayGrade,
  ].map(normalizeLookup).filter(Boolean)));
}

function matchesStudentSearch(student = {}, query = '', academicStructure = null) {
  const normalizedQuery = normalizeLookup(query);

  if (!normalizedQuery) {
    return true;
  }

  return buildStudentSearchTerms(student, academicStructure).some((term) => term.includes(normalizedQuery));
}

function isCompactDisplayGradeQuery(value) {
  return /^\d{1,2}[a-z]$/i.test(String(value || '').replace(/\s+/g, ''));
}

function serializeMedicalProfile(profile = {}) {
  return serializeStudentMedicalProfile(profile);
}

function hasCompletedMedicalProfile(student = {}) {
  const profile = student?.medicalProfile || {};
  if (profile.completedAt) {
    return true;
  }

  return Boolean(
    normalizeText(student?.bloodType)
    || normalizeText(profile.allergies)
    || normalizeText(profile.emergencyMedicalContactName)
    || normalizeText(profile.emergencyMedicalContactPhone)
    || normalizeText(profile.healthInsurance)
  );
}

function buildEnrollmentMedicalProfileRevision(student = {}) {
  const medicalProfile = serializeMedicalProfile(student.medicalProfile);
  const bloodType = normalizeText(student.bloodType);
  const changedFields = [];

  if (bloodType) {
    changedFields.push({
      key: 'bloodType',
      label: 'Tipo de sangre',
      previousValue: '',
      nextValue: bloodType,
    });
  }

  const fieldEntries = [
    ['allergies', 'Alergias o sensibilidad conocida'],
    ['chronicConditions', 'Condiciones medicas'],
    ['currentMedications', 'Medicamentos actuales'],
    ['dietaryRestrictions', 'Restricciones alimentarias'],
    ['healthInsurance', 'EPS / seguro medico'],
    ['emergencyMedicalContactName', 'Contacto medico de emergencia'],
    ['emergencyMedicalContactPhone', 'Telefono contacto medico'],
    ['physicianName', 'Medico tratante'],
    ['physicianPhone', 'Telefono medico tratante'],
  ];

  for (const [key, label] of fieldEntries) {
    const nextValue = normalizeText(medicalProfile[key]);
    if (nextValue) {
      changedFields.push({
        key,
        label,
        previousValue: '',
        nextValue,
      });
    }
  }

  const authorization = medicalProfile.medicationAuthorization || {};
  const authorizationStatus = normalizeText(authorization.status);
  if (authorizationStatus) {
    const authorizationStatusLabel = authorizationStatus === 'authorized'
      ? 'Autorizado'
      : authorizationStatus === 'not_authorized'
        ? 'No autorizado'
        : authorizationStatus;
    changedFields.push({
      key: 'medicationAuthorization.status',
      label: 'Autorizacion de medicamentos',
      previousValue: '',
      nextValue: authorizationStatusLabel,
    });
  }
  if (normalizeText(authorization.authorizedBy)) {
    changedFields.push({
      key: 'medicationAuthorization.authorizedBy',
      label: 'Responsable que autoriza',
      previousValue: '',
      nextValue: normalizeText(authorization.authorizedBy),
    });
  }

  if (!changedFields.length) {
    return null;
  }

  return {
    id: `enrollment-${String(student._id)}`,
    studentId: String(student._id),
    changedBy: {
      id: '',
      name: 'Matricula / ficha clinica',
      role: 'enrollment',
    },
    source: 'enrollment',
    changedFields,
    previousBloodType: '',
    nextBloodType: bloodType,
    previousMedicalProfile: serializeMedicalProfile({}),
    nextMedicalProfile: medicalProfile,
    createdAt: medicalProfile.completedAt || student.updatedAt || student.createdAt || null,
  };
}

function serializeStudent(student, { academicStructure = null } = {}) {
  if (!student) {
    return null;
  }

  const displayGrade = resolveStudentDisplayGrade(student, academicStructure);
  const medicalProfile = serializeMedicalProfile(student.medicalProfile);

  return {
    id: String(student._id),
    name: normalizeText(student.name),
    schoolCode: normalizeText(student.schoolCode),
    grade: normalizeText(student.grade),
    course: normalizeText(student.course),
    displayGrade,
    documentNumber: normalizeText(student.documentNumber),
    bloodType: normalizeText(student.bloodType),
    medicalProfile,
    hasMedicalProfile: hasCompletedMedicalProfile({ ...student, medicalProfile }),
    imageUrl: normalizeText(student.imageUrl),
    thumbUrl: normalizeText(student.thumbUrl),
  };
}

function serializeVisit(visit, { academicStructure = null } = {}) {
  const rawVisit = typeof visit?.toObject === 'function' ? visit.toObject() : visit;
  if (!rawVisit) {
    return null;
  }

  return {
    id: String(rawVisit._id),
    studentId: String(rawVisit.studentId?._id || rawVisit.studentId || ''),
    student: rawVisit.studentId?._id ? serializeStudent(rawVisit.studentId, { academicStructure }) : null,
    attendedBy: rawVisit.attendedByUserId?._id
      ? {
        id: String(rawVisit.attendedByUserId._id),
        name: normalizeText(rawVisit.attendedByUserId.name),
        username: normalizeText(rawVisit.attendedByUserId.username),
      }
      : null,
    symptoms: normalizeText(rawVisit.symptoms),
    treatment: normalizeText(rawVisit.treatment),
    notes: normalizeText(rawVisit.notes),
    photos: normalizeVisitPhotos(rawVisit.photos),
    disposition: normalizeText(rawVisit.disposition) || 'observation',
    attendedAt: rawVisit.attendedAt,
    createdAt: rawVisit.createdAt,
    parentNotification: rawVisit.parentNotification || {},
  };
}

async function findActiveParentIds({ schoolId, studentId }) {
  const links = await ParentStudentLink.find({ schoolId, studentId, status: 'active' })
    .select('parentId')
    .lean();
  return links.map((link) => link.parentId).filter(Boolean);
}

router.get('/students', roleMiddleware(nursingStaffRoles), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const q = normalizeText(req.query.q);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const filter = { schoolId, status: 'active', deletedAt: null };
    const requiresDisplayGradeLookup = isCompactDisplayGradeQuery(q);

    if (q) {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { name: regex },
        { schoolCode: regex },
        { documentNumber: regex },
        { grade: regex },
        { course: regex },
      ];

      if (requiresDisplayGradeLookup) {
        const compactQuery = q.replace(/\s+/g, '').toUpperCase();
        const gradeMatch = compactQuery.match(/^(\d{1,2})[A-Z]$/);
        if (gradeMatch?.[1]) {
          filter.$or.push({ grade: new RegExp(`^${escapeRegExp(gradeMatch[1])}$`, 'i') });
        }
      }
    }

    const queryLimit = q && requiresDisplayGradeLookup ? Math.max(limit * 6, 120) : limit;
    const [students, academicStructure] = await Promise.all([
      Student.find(filter)
        .select('name schoolCode grade course documentNumber bloodType medicalProfile imageUrl thumbUrl')
        .sort(q ? { name: 1 } : { updatedAt: -1, name: 1 })
        .limit(queryLimit)
        .lean(),
      AcademicStructure.findOne({ schoolId }).lean(),
    ]);

    const serializedStudents = students
      .map((student) => serializeStudent(student, { academicStructure }))
      .filter((student) => matchesStudentSearch(student, q, academicStructure))
      .sort((left, right) => {
        const byProfile = Number(Boolean(right.hasMedicalProfile)) - Number(Boolean(left.hasMedicalProfile));
        if (byProfile !== 0) {
          return byProfile;
        }
        return String(left.name || '').localeCompare(String(right.name || ''), 'es', { sensitivity: 'base' });
      })
      .slice(0, limit);

    return res.status(200).json({ students: serializedStudents });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/students/:studentId/history', roleMiddleware(nursingStaffRoles), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { studentId } = req.params;

    if (!isValidObjectId(studentId)) {
      return res.status(400).json({ message: 'Invalid student id' });
    }

    const [student, visits, parentLinks, academicStructure] = await Promise.all([
      Student.findOne({ _id: studentId, schoolId, deletedAt: null })
        .select('name schoolCode grade course documentNumber bloodType medicalProfile imageUrl thumbUrl')
        .lean(),
      NursingVisit.find({ schoolId, studentId })
        .populate('attendedByUserId', 'name username')
        .sort({ attendedAt: -1, createdAt: -1 })
        .limit(50)
        .lean(),
      ParentStudentLink.find({ schoolId, studentId, status: 'active' })
        .populate('parentId', 'name username phone email')
        .lean(),
      AcademicStructure.findOne({ schoolId }).lean(),
    ]);

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    return res.status(200).json({
      student: serializeStudent(student, { academicStructure }),
      guardians: parentLinks.map(serializeGuardian).filter((guardian) => guardian.id),
      visits: visits.map((visit) => serializeVisit(visit, { academicStructure })),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/uploads/image', roleMiddleware(nursingStaffRoles), (req, res) => {
  uploadImageMiddleware.single('image')(req, res, async (error) => {
    if (error) {
      const statusCode = error?.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(statusCode).json({
        message: error.message || 'No se pudo procesar la imagen.',
      });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ message: 'Selecciona una imagen.' });
      }

      const cloudinaryEnabled = isCloudinaryEnabled();
      const saved = await processAndStoreUploadedImage({
        file: req.file,
        folder: 'nursing-visits',
        preferredName: req.body?.preferredName || req.file?.originalname || 'nursing-visit',
        requireCloudinary: cloudinaryEnabled,
      });

      return res.status(201).json({
        photo: {
          url: normalizeStoredImageUrl(saved.url),
          thumbUrl: normalizeStoredImageUrl(saved.thumbUrl || saved.url),
          alt: normalizeText(req.body?.alt),
        },
      });
    } catch (processingError) {
      return res.status(400).json({
        message: processingError.message || 'No se pudo guardar la imagen.',
      });
    }
  });
});

router.get('/students/:studentId/medical-profile/history', roleMiddleware(nursingStaffRoles), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { studentId } = req.params;

    if (!isValidObjectId(studentId)) {
      return res.status(400).json({ message: 'Invalid student id' });
    }

    const student = await Student.findOne({ _id: studentId, schoolId, deletedAt: null })
      .select('bloodType medicalProfile createdAt updatedAt')
      .lean();
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const revisions = await listStudentMedicalProfileRevisions({
      schoolId,
      studentId,
      limit: req.query.limit,
    });

    // Fichas cargadas en matrícula antes del historial de revisiones no generan filas;
    // exponemos un snapshot para que enfermería vea el origen de los datos.
    if (!revisions.length && hasCompletedMedicalProfile(student)) {
      const enrollmentRevision = buildEnrollmentMedicalProfileRevision(student);
      if (enrollmentRevision) {
        return res.status(200).json({ revisions: [enrollmentRevision] });
      }
    }

    return res.status(200).json({ revisions });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/medical-profile-signatures', roleMiddleware(nursingStaffRoles), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const [students, academicStructure] = await Promise.all([
      Student.find({
        schoolId,
        deletedAt: null,
        status: 'active',
        'medicalProfile.signatureImage': { $exists: true, $nin: [null, ''] },
      })
        .select('name schoolCode grade course bloodType medicalProfile imageUrl thumbUrl')
        .sort({ 'medicalProfile.signedAt': -1, updatedAt: -1 })
        .limit(limit)
        .lean(),
      AcademicStructure.findOne({ schoolId }).lean(),
    ]);

    return res.status(200).json({
      signatures: students.map((student) => {
        const serialized = serializeStudent(student, { academicStructure });
        const medicalProfile = serialized?.medicalProfile || {};
        return {
          studentId: serialized.id,
          studentName: serialized.name,
          schoolCode: serialized.schoolCode,
          displayGrade: serialized.displayGrade,
          grade: serialized.grade,
          course: serialized.course,
          bloodType: serialized.bloodType,
          imageUrl: serialized.imageUrl,
          thumbUrl: serialized.thumbUrl,
          signatureImage: medicalProfile.signatureImage || '',
          signedAt: medicalProfile.signedAt || null,
          signedByParentName: medicalProfile.signedByParentName || '',
          signedByParentId: medicalProfile.signedByParentId || '',
          hasMedicalProfile: serialized.hasMedicalProfile,
        };
      }),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/visits', roleMiddleware(nursingStaffRoles), async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const studentId = normalizeText(req.body.studentId);
    const symptoms = normalizeText(req.body.symptoms);
    const treatment = normalizeText(req.body.treatment);
    const notes = normalizeText(req.body.notes);
    const photos = normalizeVisitPhotos(req.body.photos);
    const disposition = ['return_class', 'observation', 'sent_home', 'referred', 'other'].includes(normalizeText(req.body.disposition))
      ? normalizeText(req.body.disposition)
      : 'observation';

    if (!isValidObjectId(studentId)) {
      return res.status(400).json({ message: 'studentId is invalid' });
    }

    if (!symptoms || !treatment) {
      return res.status(400).json({ message: 'symptoms and treatment are required' });
    }

    const student = await Student.findOne({ _id: studentId, schoolId, deletedAt: null })
      .select('name schoolCode grade course documentNumber bloodType imageUrl thumbUrl')
      .lean();
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const visit = await NursingVisit.create({
      schoolId,
      studentId,
      attendedByUserId: userId,
      symptoms,
      treatment,
      notes,
      photos,
      disposition,
    });

    const [parentIds, academicStructure] = await Promise.all([
      findActiveParentIds({ schoolId, studentId }),
      AcademicStructure.findOne({ schoolId }).lean(),
    ]);
    const notificationPatch = { attempted: parentIds.length > 0 };

    if (parentIds.length > 0) {
      try {
        const childName = firstName(student.name);
        const notificationResult = await queueNotificationsForParents({
          schoolId,
          parentIds,
          studentId,
          title: `Atencion de enfermeria para ${childName}`,
          body: `${childName} fue atendido en enfermeria. Sintomas: ${symptoms}. Manejo: ${treatment}.${photos.length ? ` Incluye ${photos.length} foto${photos.length === 1 ? '' : 's'}.` : ''}`,
          payload: {
            type: 'nursing.visit',
            nursingVisitId: String(visit._id),
            studentId: String(studentId),
            url: buildParentPushUrl('nursing.visit', { studentId }),
            disposition,
          },
        });

        Object.assign(notificationPatch, {
          notificationsCreated: Number(notificationResult.notificationsCreated || 0),
          tokensFound: Number(notificationResult.tokensFound || 0),
          directDelivered: Number(notificationResult.directDelivered || 0),
          directFailed: Number(notificationResult.directFailed || 0),
          queued: Boolean(notificationResult.queued),
          queuedCount: Number(notificationResult.queuedCount || 0),
          queueReason: normalizeText(notificationResult.queueReason),
        });
      } catch (notificationError) {
        notificationPatch.error = notificationError.message || 'Notification failed';
      }
    }

    visit.parentNotification = notificationPatch;
    await visit.save();
    await visit.populate('attendedByUserId', 'name username');
    await visit.populate('studentId', 'name schoolCode grade course documentNumber bloodType imageUrl thumbUrl');

    const childName = firstName(student.name);
    notifySchoolStaffRoles({
      schoolId,
      roles: ['rectoria', 'direccion', 'coordination', 'admin'],
      studentId,
      title: `Nuevo caso de enfermería: ${childName}`,
      body: `${childName} fue atendido en enfermería. Síntomas: ${symptoms}. Manejo: ${treatment}.`,
      payload: {
        type: 'nursing.visit.staff',
        nursingVisitId: String(visit._id),
        studentId: String(studentId),
        sectionKey: 'control_nursing',
        url: '/rectoria',
      },
    }).catch((error) => console.warn(`[NURSING_STAFF_NOTIFY_WARNING] visit=${visit._id} error=${error.message}`));

    return res.status(201).json({
      visit: serializeVisit(visit, { academicStructure }),
      parentIdsNotified: parentIds.map(String),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/summary', roleMiddleware(nursingSummaryViewerRoles), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const now = new Date();
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));

    const [totalVisits, visitsThisWeek, studentsWithVisits, recentVisits] = await Promise.all([
      NursingVisit.countDocuments({ schoolId }),
      NursingVisit.countDocuments({ schoolId, attendedAt: { $gte: startOfWeek } }),
      NursingVisit.distinct('studentId', { schoolId }),
      NursingVisit.find({ schoolId })
        .populate('studentId', 'name schoolCode grade course imageUrl thumbUrl')
        .populate('attendedByUserId', 'name username')
        .sort({ attendedAt: -1, createdAt: -1 })
        .limit(20)
        .lean(),
    ]);

    const academicStructure = await AcademicStructure.findOne({ schoolId }).select('grades levels').lean();

    return res.status(200).json({
      summary: {
        totalVisits,
        visitsThisWeek,
        studentsAttended: studentsWithVisits.length,
      },
      recentVisits: recentVisits.map((visit) => {
        const serialized = serializeVisit(visit, { academicStructure });
        return {
          ...serialized,
          studentName: normalizeText(serialized?.student?.name) || 'Alumno',
          reason: normalizeText(serialized?.symptoms) || 'Atención',
        };
      }),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/parent/records', roleMiddleware('parent', 'admin', 'student'), async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    let linkedStudentIds = [];

    if (role === 'student') {
      const studentUser = await User.findOne({
        _id: userId,
        schoolId,
        role: 'student',
        status: 'active',
        deletedAt: null,
      }).select('linkedStudentId').lean();
      if (studentUser?.linkedStudentId) {
        linkedStudentIds = [String(studentUser.linkedStudentId)];
      }
    } else {
      const parentId = role === 'admin' && req.query.parentId ? req.query.parentId : userId;
      const links = await ParentStudentLink.find({ schoolId, parentId, status: 'active' }).select('studentId').lean();
      linkedStudentIds = links.map((link) => String(link.studentId));
    }

    const requestedStudentId = normalizeText(req.query.studentId);

    if (!linkedStudentIds.length) {
      return res.status(200).json({ records: [], recordsByStudentId: {}, latestByStudentId: {} });
    }

    if (requestedStudentId && !linkedStudentIds.includes(requestedStudentId)) {
      return res.status(403).json({ message: 'Forbidden studentId' });
    }

    const studentIds = requestedStudentId ? [requestedStudentId] : linkedStudentIds;
    const [records, academicStructure] = await Promise.all([
      NursingVisit.find({ schoolId, studentId: { $in: studentIds } })
        .sort({ attendedAt: -1, createdAt: -1 })
        .limit(100)
        .lean(),
      AcademicStructure.findOne({ schoolId }).lean(),
    ]);

    const serializedRecords = records.map((record) => serializeVisit(record, { academicStructure }));
    const recordsByStudentId = {};
    const latestByStudentId = {};

    for (const record of serializedRecords) {
      const key = String(record.studentId || '');
      if (!key) {
        continue;
      }
      recordsByStudentId[key] = recordsByStudentId[key] || [];
      recordsByStudentId[key].push(record);
      latestByStudentId[key] = latestByStudentId[key] || record;
    }

    return res.status(200).json({ records: serializedRecords, recordsByStudentId, latestByStudentId });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;