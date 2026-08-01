const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const {
  CONECTA_STAFF_ROLES,
  resolveAuthorSubjects,
  createCase,
  listCases,
  getCommunityStats,
  getUnreadCount,
  toggleCaseLike,
  addComment,
  toggleCommentLike,
} = require('../services/conecta.service');
const {
  uploadImageMiddleware,
  processAndStoreUploadedImage,
  isCloudinaryEnabled,
  normalizeStoredImageUrl,
} = require('../utils/imageUpload');
const { runWithSchoolContext, getControlDbSchoolIds } = require('../config/db');
const User = require('../models/user.model');

const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware(...CONECTA_STAFF_ROLES));

function getActor(req) {
  return {
    schoolId: req.user.schoolId,
    userId: req.user.userId || req.user.id || req.user._id,
    name: req.user.name || req.user.username || 'Colega Comergio',
    role: req.user.role,
  };
}

router.get('/meta', async (req, res) => {
  try {
    const actor = getActor(req);
    const subjects = await resolveAuthorSubjects({
      schoolId: actor.schoolId,
      userId: actor.userId,
    });
    return res.json({
      subjects: subjects.subjects,
      roles: CONECTA_STAFF_ROLES,
      schoolId: actor.schoolId,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'No se pudo cargar Conecta.' });
  }
});

router.get('/unread-count', async (req, res) => {
  try {
    const actor = getActor(req);
    const unreadCount = await getUnreadCount({
      schoolId: actor.schoolId,
      userId: actor.userId,
    });
    return res.json({ unreadCount });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'No se pudo consultar notificaciones de Conecta.' });
  }
});

router.get('/cases', async (req, res) => {
  try {
    const actor = getActor(req);
    const cases = await listCases({
      schoolId: actor.schoolId,
      userId: actor.userId,
      limit: req.query.limit,
    });

    let stats = null;
    try {
      const statsPromise = getCommunityStats().catch((error) => {
        console.warn(`[CONECTA_STATS] ${error.message || error}`);
        return null;
      });
      stats = await Promise.race([
        statsPromise,
        new Promise((resolve) => {
          setTimeout(() => resolve(null), 8000);
        }),
      ]);
    } catch (error) {
      console.warn(`[CONECTA_STATS] ${error.message || error}`);
      stats = null;
    }

    if (!stats) {
      const schoolIds = new Set(cases.map((item) => item.author?.schoolId).filter(Boolean));
      stats = {
        activeTeachers: 100,
        schools: Math.max(schoolIds.size, getControlDbSchoolIds().size),
        sharedCases: cases.length,
        featured: cases.slice(0, 3).map((item) => ({
          id: item.id,
          title: item.title,
          schoolName: item.author?.schoolName,
          photoUrl: item.author?.photoUrl,
          authorName: item.author?.name,
        })),
        trending: [],
      };
    }

    return res.json({ cases, stats });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'No se pudo cargar el feed de Conecta.' });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const stats = await getCommunityStats();
    return res.json(stats);
  } catch (error) {
    return res.status(500).json({ message: error.message || 'No se pudo cargar las estadísticas de Conecta.' });
  }
});

router.post('/uploads/image', (req, res) => {
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
        folder: 'conecta',
        preferredName: req.body?.preferredName || req.file?.originalname || 'conecta-case',
        requireCloudinary: cloudinaryEnabled,
      });

      if (cloudinaryEnabled && saved.storage !== 'cloudinary') {
        return res.status(503).json({
          message: 'Las fotos de Conecta solo se pueden guardar en Cloudinary.',
        });
      }

      return res.status(201).json({
        media: {
          kind: 'image',
          src: normalizeStoredImageUrl(saved.url),
          thumbUrl: normalizeStoredImageUrl(saved.thumbUrl || saved.url),
          alt: String(req.body?.alt || '').trim(),
        },
      });
    } catch (processingError) {
      return res.status(400).json({
        message: processingError.message || 'No se pudo guardar la imagen.',
      });
    }
  });
});

router.post('/cases', async (req, res) => {
  try {
    const actor = getActor(req);
    const photoUrl = await runWithSchoolContext(actor.schoolId, async () => {
      const user = await User.findById(actor.userId).select('campusPhotoUrl').lean();
      return String(user?.campusPhotoUrl || '').trim();
    });

    const created = await createCase({
      schoolId: actor.schoolId,
      userId: actor.userId,
      name: actor.name,
      role: actor.role,
      photoUrl,
      title: req.body?.title,
      body: req.body?.body,
      subjectKey: req.body?.subjectKey,
      subjectLabel: req.body?.subjectLabel,
      media: req.body?.media,
    });

    return res.status(201).json({ case: created });
  } catch (error) {
    return res.status(400).json({ message: error.message || 'No se pudo publicar el caso.' });
  }
});

router.post('/cases/:caseId/like', async (req, res) => {
  try {
    const actor = getActor(req);
    const updated = await toggleCaseLike({
      schoolId: actor.schoolId,
      userId: actor.userId,
      name: actor.name,
      caseId: req.params.caseId,
    });
    return res.json({ case: updated });
  } catch (error) {
    return res.status(400).json({ message: error.message || 'No se pudo actualizar el like.' });
  }
});

router.post('/cases/:caseId/comments', async (req, res) => {
  try {
    const actor = getActor(req);
    const updated = await addComment({
      schoolId: actor.schoolId,
      userId: actor.userId,
      name: actor.name,
      role: actor.role,
      caseId: req.params.caseId,
      body: req.body?.body,
    });
    return res.json({ case: updated });
  } catch (error) {
    return res.status(400).json({ message: error.message || 'No se pudo publicar el comentario.' });
  }
});

router.post('/cases/:caseId/comments/:commentId/like', async (req, res) => {
  try {
    const actor = getActor(req);
    const updated = await toggleCommentLike({
      schoolId: actor.schoolId,
      userId: actor.userId,
      name: actor.name,
      caseId: req.params.caseId,
      commentId: req.params.commentId,
    });
    return res.json({ case: updated });
  } catch (error) {
    return res.status(400).json({ message: error.message || 'No se pudo actualizar el like del comentario.' });
  }
});

module.exports = router;
