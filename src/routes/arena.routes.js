const express = require('express');

const authMiddleware = require('../middleware/authMiddleware');
const { getCampusAccessContext } = require('../utils/campusAccess');
const CampusCourse = require('../models/campusCourse.model');
const {
  MAX_CAMPUS_MATERIAL_FILES,
  uploadCampusMaterialsMiddleware,
  processStoredCampusMaterialFiles,
  resolveUploadMimeType,
  detectMaterialKind,
} = require('../utils/campusMaterialUpload');
const { isCloudinaryEnabled } = require('../utils/imageUpload');
const { serializeCampusAttachment } = require('../utils/cloudinaryDocumentDelivery');
const arenaService = require('../services/arena.service');

const router = express.Router();

router.use(authMiddleware);

function sendArenaError(res, error) {
  const status = Number(error?.status || 500);
  return res.status(status >= 400 && status < 600 ? status : 500).json({
    message: error?.message || 'No se pudo completar la acción en Arena.',
  });
}

async function requireArenaTeacher(req, res, next) {
  try {
    const role = String(req.user?.role || '').trim();
    if (['teacher', 'admin', 'rectoria', 'direccion'].includes(role)) {
      return next();
    }

    const schoolId = String(req.user?.schoolId || '').trim();
    const teacherUserId = String(req.user?.userId || '').trim();
    if (schoolId && teacherUserId) {
      const assigned = await CampusCourse.exists({ schoolId, teacherUserId, status: 'active' });
      if (assigned) {
        return next();
      }
    }

    const campusContext = await getCampusAccessContext(req.user);
    const isTeacher = (campusContext.memberships || []).some((membership) => membership.memberType === 'campus_teacher');
    if (!isTeacher) {
      return res.status(403).json({ message: 'Campus Docente no esta habilitado para este usuario.' });
    }
    return next();
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

function requireArenaStudent(req, res, next) {
  const role = String(req.user?.role || '').trim();
  if (!['student', 'admin'].includes(role)) {
    return res.status(403).json({ message: 'Solo los alumnos pueden entrar a una partida de Arena.' });
  }
  return next();
}

function teacherContext(req) {
  return {
    schoolId: req.user.schoolId,
    teacherUserId: req.user.userId,
  };
}

function studentContext(req) {
  return {
    schoolId: req.user.schoolId,
    userId: req.user.userId,
    linkedStudentId: req.user.linkedStudentId,
    requestedStudentId: req.user.role === 'admin'
      ? (req.body?.studentId || req.query?.studentId || '')
      : '',
  };
}

router.get('/teacher/quizzes', requireArenaTeacher, async (req, res) => {
  try {
    const quizzes = await arenaService.listQuizzes(teacherContext(req));
    return res.json({ quizzes });
  } catch (error) {
    return sendArenaError(res, error);
  }
});

router.post('/teacher/quizzes', requireArenaTeacher, async (req, res) => {
  try {
    const result = await arenaService.createQuiz({ ...teacherContext(req), body: req.body || {} });
    return res.status(201).json(result);
  } catch (error) {
    return sendArenaError(res, error);
  }
});

router.get('/teacher/quizzes/:quizId', requireArenaTeacher, async (req, res) => {
  try {
    const quiz = await arenaService.getQuiz({ ...teacherContext(req), quizId: req.params.quizId });
    return res.json({ quiz });
  } catch (error) {
    return sendArenaError(res, error);
  }
});

router.put('/teacher/quizzes/:quizId', requireArenaTeacher, async (req, res) => {
  try {
    const result = await arenaService.updateQuiz({
      ...teacherContext(req),
      quizId: req.params.quizId,
      body: req.body || {},
    });
    return res.json(result);
  } catch (error) {
    return sendArenaError(res, error);
  }
});

router.delete('/teacher/quizzes/:quizId', requireArenaTeacher, async (req, res) => {
  try {
    const result = await arenaService.deleteQuiz({ ...teacherContext(req), quizId: req.params.quizId });
    return res.json(result);
  } catch (error) {
    return sendArenaError(res, error);
  }
});

router.post('/teacher/quizzes/:quizId/play', requireArenaTeacher, async (req, res) => {
  try {
    const session = await arenaService.playQuiz({ ...teacherContext(req), quizId: req.params.quizId });
    return res.status(201).json({ session });
  } catch (error) {
    return sendArenaError(res, error);
  }
});

router.get('/teacher/sessions/active', requireArenaTeacher, async (req, res) => {
  try {
    const session = await arenaService.getActiveHostSession(teacherContext(req));
    return res.json({ session });
  } catch (error) {
    return sendArenaError(res, error);
  }
});

router.get('/teacher/sessions/:sessionId', requireArenaTeacher, async (req, res) => {
  try {
    const session = await arenaService.getHostSession({
      ...teacherContext(req),
      sessionId: req.params.sessionId,
    });
    return res.json({ session });
  } catch (error) {
    return sendArenaError(res, error);
  }
});

router.post('/teacher/sessions/:sessionId/advance', requireArenaTeacher, async (req, res) => {
  try {
    const session = await arenaService.advanceSession({
      ...teacherContext(req),
      sessionId: req.params.sessionId,
      action: req.body?.action,
    });
    return res.json({ session });
  } catch (error) {
    return sendArenaError(res, error);
  }
});

router.post('/teacher/sessions/:sessionId/end', requireArenaTeacher, async (req, res) => {
  try {
    const session = await arenaService.endSession({
      ...teacherContext(req),
      sessionId: req.params.sessionId,
    });
    return res.json({ session });
  } catch (error) {
    return sendArenaError(res, error);
  }
});

router.post(
  '/teacher/media',
  requireArenaTeacher,
  uploadCampusMaterialsMiddleware.array('files', Math.min(1, MAX_CAMPUS_MATERIAL_FILES)),
  async (req, res) => {
    try {
      const incomingFiles = Array.isArray(req.files) ? req.files : [];
      if (!incomingFiles.length) {
        return res.status(400).json({ message: 'No se recibió ninguna imagen.' });
      }

      incomingFiles.forEach((file) => {
        const resolvedMimeType = resolveUploadMimeType(file);
        if (resolvedMimeType) {
          file.mimetype = resolvedMimeType;
        }
      });

      const imageFile = incomingFiles.find((file) => detectMaterialKind(file) === 'image');
      if (!imageFile) {
        return res.status(400).json({ message: 'Solo se permiten imágenes en las preguntas de Arena.' });
      }

      const materials = await processStoredCampusMaterialFiles([imageFile], {
        folder: 'campus-arena',
        schoolId: req.user.schoolId,
        createdByUserId: req.user.userId,
        requireCloudinary: isCloudinaryEnabled(),
      });
      const material = materials[0];
      if (!material) {
        return res.status(500).json({ message: 'No se pudo guardar la imagen.' });
      }
      return res.status(201).json({
        imageUrl: serializeCampusAttachment(material).url,
        material: serializeCampusAttachment(material),
      });
    } catch (error) {
      return res.status(500).json({ message: error.message || 'No se pudo subir la imagen.' });
    }
  }
);

router.post('/student/join', requireArenaStudent, async (req, res) => {
  try {
    const session = await arenaService.joinSession({
      ...studentContext(req),
      pin: req.body?.pin,
    });
    return res.json({ session });
  } catch (error) {
    return sendArenaError(res, error);
  }
});

router.get('/student/sessions/:sessionId', requireArenaStudent, async (req, res) => {
  try {
    const session = await arenaService.getStudentSession({
      ...studentContext(req),
      sessionId: req.params.sessionId,
    });
    return res.json({ session });
  } catch (error) {
    return sendArenaError(res, error);
  }
});

router.post('/student/sessions/:sessionId/answer', requireArenaStudent, async (req, res) => {
  try {
    const session = await arenaService.submitAnswer({
      ...studentContext(req),
      sessionId: req.params.sessionId,
      selectedAnswerKeys: req.body?.selectedAnswerKeys,
      orderedAnswerKeys: req.body?.orderedAnswerKeys,
    });
    return res.json({ session });
  } catch (error) {
    return sendArenaError(res, error);
  }
});

module.exports = router;
