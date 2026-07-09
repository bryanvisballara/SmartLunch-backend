const express = require('express');
const mongoose = require('mongoose');

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const CommunityReport = require('../models/communityReport.model');
const ParentStudentLink = require('../models/parentStudentLink.model');
const Student = require('../models/student.model');
const User = require('../models/user.model');
const { queueNotificationsForParents } = require('../services/notification.service');

const router = express.Router();

router.use(authMiddleware);

const institutionalViewerRoles = ['rectoria', 'direccion', 'coordination', 'psychology', 'admin'];
const reportAuthorRoles = ['parent', 'student', 'admin'];

const reportTypeLabels = {
  bullying: 'Reporte de bullying',
  teacher_complaint: 'Reporte de docente',
  school_recommendation: 'Recomendación para el colegio',
};

function normalizeText(value) {
  return String(value || '').trim();
}

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ''));
}

function serializeCommunityReport(report = {}, { includeInternalFields = false } = {}) {
  const isAnonymous = Boolean(report.isAnonymous);
  const payload = {
    id: String(report._id || ''),
    reportType: normalizeText(report.reportType),
    reportTypeLabel: reportTypeLabels[report.reportType] || 'Reporte comunitario',
    message: normalizeText(report.message),
    teacherName: normalizeText(report.teacherName),
    isAnonymous,
    reporterRole: normalizeText(report.reporterRole),
    reporterLabel: isAnonymous ? 'Anónimo' : (normalizeText(report.reporterName) || 'Usuario registrado'),
    studentId: report.studentId ? String(report.studentId) : '',
    studentName: normalizeText(report.studentName),
    status: normalizeText(report.status) || 'pending',
    submittedAt: report.submittedAt || report.createdAt || null,
    reviewedAt: report.reviewedAt || null,
    reviewedByName: normalizeText(report.reviewedByName),
  };

  if (includeInternalFields && !isAnonymous) {
    payload.reporterUserId = report.reporterUserId ? String(report.reporterUserId) : '';
    payload.reporterName = normalizeText(report.reporterName);
  }

  return payload;
}

async function resolveReporterStudentContext(req) {
  const { schoolId, userId, role } = req.user;
  const requestedStudentId = normalizeText(req.body?.studentId);

  if (role === 'student') {
    const user = await User.findOne({ _id: userId, schoolId, deletedAt: null })
      .select('linkedStudentId name')
      .lean();
    if (!user?.linkedStudentId) {
      return { error: 'No se encontró el alumno vinculado a esta cuenta.' };
    }

    const student = await Student.findOne({
      _id: user.linkedStudentId,
      schoolId,
      deletedAt: null,
      status: 'active',
    }).select('firstName lastName name grade course').lean();

    if (!student) {
      return { error: 'Alumno no encontrado.' };
    }

    return {
      student,
      reporterRole: 'student',
      reporterName: normalizeText(user.name),
    };
  }

  let student = null;
  if (requestedStudentId && isValidObjectId(requestedStudentId)) {
    const link = await ParentStudentLink.findOne({
      schoolId,
      parentId: userId,
      studentId: requestedStudentId,
      status: 'active',
    }).lean();
    if (!link) {
      return { error: 'No tienes acceso a ese alumno.' };
    }

    student = await Student.findOne({
      _id: requestedStudentId,
      schoolId,
      deletedAt: null,
      status: 'active',
    }).select('firstName lastName name grade course').lean();
  } else {
    const link = await ParentStudentLink.findOne({ schoolId, parentId: userId, status: 'active' })
      .sort({ updatedAt: -1 })
      .lean();
    if (link?.studentId) {
      student = await Student.findOne({
        _id: link.studentId,
        schoolId,
        deletedAt: null,
        status: 'active',
      }).select('firstName lastName name grade course').lean();
    }
  }

  const parentUser = await User.findOne({ _id: userId, schoolId, deletedAt: null })
    .select('name')
    .lean();

  return {
    student,
    reporterRole: 'parent',
    reporterName: normalizeText(parentUser?.name),
  };
}

function buildStudentDisplayName(student = {}) {
  return normalizeText(student.name)
    || `${normalizeText(student.firstName)} ${normalizeText(student.lastName)}`.trim();
}

async function notifyInstitutionalCommunityReport({ schoolId, report }) {
  const users = await User.find({
    schoolId,
    role: { $in: institutionalViewerRoles },
    status: 'active',
    deletedAt: null,
  }).select('_id role').lean();

  const notificationTargets = [
    { roles: ['coordination'], url: '/coordinacion' },
    { roles: ['psychology'], url: '/psicologia' },
    { roles: ['rectoria', 'admin'], url: '/rectoria' },
    { roles: ['direccion'], url: '/direccion' },
  ].map((target) => ({
    ...target,
    userIds: users
      .filter((user) => target.roles.includes(normalizeText(user.role)))
      .map((user) => user._id)
      .filter(Boolean),
  })).filter((target) => target.userIds.length > 0);

  const reporterLabel = report.isAnonymous ? 'Un reporte anónimo' : (normalizeText(report.reporterName) || 'Un acudiente o alumno');
  const typeLabel = reportTypeLabels[report.reportType] || 'Reporte comunitario';

  await Promise.all(notificationTargets.map((target) => queueNotificationsForParents({
    schoolId,
    parentIds: target.userIds,
    studentId: report.studentId,
    title: `Colibrí: ${typeLabel}`,
    body: `${reporterLabel} envió un reporte para revisión institucional.`,
    payload: {
      type: 'community.report',
      reportId: String(report._id),
      reportType: String(report.reportType || ''),
      url: target.url,
    },
  })));
}

router.post('/', roleMiddleware(...reportAuthorRoles), async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const reportType = normalizeText(req.body?.reportType);
    const message = normalizeText(req.body?.message);
    const teacherName = normalizeText(req.body?.teacherName);
    const isAnonymous = Boolean(req.body?.isAnonymous);

    if (!['bullying', 'teacher_complaint', 'school_recommendation'].includes(reportType)) {
      return res.status(400).json({ message: 'Tipo de reporte inválido.' });
    }

    if (!message || message.length < 10) {
      return res.status(400).json({ message: 'Describe el reporte con al menos 10 caracteres.' });
    }

    if (reportType === 'teacher_complaint' && !teacherName) {
      return res.status(400).json({ message: 'Indica el nombre del docente a reportar.' });
    }

    const reporterContext = await resolveReporterStudentContext(req);
    if (reporterContext.error) {
      return res.status(400).json({ message: reporterContext.error });
    }

    const report = await CommunityReport.create({
      schoolId,
      reportType,
      message,
      teacherName: reportType === 'teacher_complaint' ? teacherName : '',
      isAnonymous,
      reporterUserId: userId,
      reporterName: isAnonymous ? '' : reporterContext.reporterName,
      reporterRole: reporterContext.reporterRole,
      studentId: reporterContext.student?._id || null,
      studentName: buildStudentDisplayName(reporterContext.student || {}),
      status: 'pending',
      submittedAt: new Date(),
    });

    notifyInstitutionalCommunityReport({ schoolId, report })
      .catch((error) => console.warn(`[COMMUNITY_REPORT_NOTIFY_WARNING] report=${report._id} error=${error.message}`));

    return res.status(201).json({
      message: 'Reporte enviado. El equipo institucional lo revisará pronto.',
      report: serializeCommunityReport(report),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'No se pudo enviar el reporte.' });
  }
});

router.get('/', roleMiddleware(...institutionalViewerRoles), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const status = normalizeText(req.query?.status);
    const reportType = normalizeText(req.query?.reportType);
    const limit = Math.min(100, Math.max(1, Number(req.query?.limit || 50)));

    const query = { schoolId };
    if (['pending', 'reviewed', 'archived'].includes(status)) {
      query.status = status;
    }
    if (['bullying', 'teacher_complaint', 'school_recommendation'].includes(reportType)) {
      query.reportType = reportType;
    }

    const [reports, summaryRows] = await Promise.all([
      CommunityReport.find(query).sort({ submittedAt: -1 }).limit(limit).lean(),
      CommunityReport.aggregate([
        { $match: { schoolId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);

    const summary = summaryRows.reduce((accumulator, row) => {
      accumulator[row._id] = row.count;
      return accumulator;
    }, { pending: 0, reviewed: 0, archived: 0 });

    return res.status(200).json({
      summary,
      reports: reports.map((report) => serializeCommunityReport(report, { includeInternalFields: true })),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'No se pudieron cargar los reportes.' });
  }
});

router.patch('/:reportId/status', roleMiddleware(...institutionalViewerRoles), async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const reportId = req.params.reportId;
    const nextStatus = normalizeText(req.body?.status);

    if (!isValidObjectId(reportId)) {
      return res.status(400).json({ message: 'Reporte inválido.' });
    }

    if (!['pending', 'reviewed', 'archived'].includes(nextStatus)) {
      return res.status(400).json({ message: 'Estado inválido.' });
    }

    const reviewer = await User.findOne({ _id: userId, schoolId, deletedAt: null })
      .select('name')
      .lean();

    const report = await CommunityReport.findOneAndUpdate(
      { _id: reportId, schoolId },
      {
        $set: {
          status: nextStatus,
          reviewedAt: nextStatus === 'pending' ? null : new Date(),
          reviewedByUserId: nextStatus === 'pending' ? null : userId,
          reviewedByName: nextStatus === 'pending' ? '' : normalizeText(reviewer?.name),
        },
      },
      { new: true },
    ).lean();

    if (!report) {
      return res.status(404).json({ message: 'Reporte no encontrado.' });
    }

    return res.status(200).json({
      report: serializeCommunityReport(report, { includeInternalFields: true }),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'No se pudo actualizar el reporte.' });
  }
});

module.exports = router;
