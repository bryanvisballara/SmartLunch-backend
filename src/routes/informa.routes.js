const express = require('express');
const multer = require('multer');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const {
  INFORMA_VIEWER_ROLES,
  canPublishInforma,
  createPost,
  listPosts,
  getUnreadCount,
  togglePostLike,
  addComment,
  toggleCommentLike,
  archivePost,
} = require('../services/informa.service');
const {
  generateInformaDraft,
  listDrafts,
  publishDraft,
  discardDraft,
} = require('../services/informaAuto.service');
const {
  processAndStoreUploadedImage,
  isCloudinaryEnabled,
  normalizeStoredImageUrl,
} = require('../utils/imageUpload');
const {
  processStoredCampusMaterialFiles,
  MAX_CAMPUS_MATERIAL_FILE_BYTES,
} = require('../utils/campusMaterialUpload');

const router = express.Router();

const uploadInformaMedia = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_CAMPUS_MATERIAL_FILE_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    const mimeType = String(file?.mimetype || '').toLowerCase();
    if (mimeType.startsWith('image/') || mimeType.startsWith('video/')) {
      return callback(null, true);
    }
    return callback(new Error('Solo se permiten imágenes o videos.'));
  },
});

function getActor(req) {
  return {
    schoolId: req.user.schoolId,
    userId: req.user.userId || req.user.id || req.user._id,
    name: req.user.name || req.user.username || 'Equipo Comergio',
    role: req.user.role,
  };
}

function requirePublisher(req, res, next) {
  if (!canPublishInforma(req.user?.role)) {
    return res.status(403).json({ message: 'Solo Gerencia Comergio puede publicar en Comergio Informa.' });
  }
  return next();
}

function requireCronSecret(req, res, next) {
  const expected = String(process.env.INFORMA_CRON_SECRET || process.env.CRON_SECRET || '').trim();
  if (!expected) {
    return res.status(503).json({ message: 'INFORMA_CRON_SECRET no está configurado.' });
  }
  const provided = String(req.get('x-cron-secret') || req.query.secret || req.body?.secret || '').trim();
  if (!provided || provided !== expected) {
    return res.status(401).json({ message: 'Secret de cron inválido.' });
  }
  return next();
}

router.post('/jobs/generate-draft', requireCronSecret, async (req, res) => {
  try {
    const force = req.body?.force === true || req.query.force === '1';
    const slotKey = String(req.body?.slotKey || req.query.slotKey || '').trim();
    const result = await generateInformaDraft({
      slotKey: slotKey || `manual-${Date.now()}`,
      force,
    });
    return res.status(result.skipped ? 200 : 201).json(result);
  } catch (error) {
    console.warn(`[INFORMA_AUTO] manual/cron generate failed: ${error.message || error}`);
    return res.status(500).json({ message: error.message || 'No se pudo generar el borrador.' });
  }
});

router.use(authMiddleware);
router.use(roleMiddleware(...INFORMA_VIEWER_ROLES));

router.get('/meta', async (req, res) => {
  try {
    const actor = getActor(req);
    return res.json({
      canPublish: canPublishInforma(actor.role),
      roles: INFORMA_VIEWER_ROLES,
      schoolId: actor.schoolId,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'No se pudo cargar Comergio Informa.' });
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
    return res.status(500).json({ message: error.message || 'No se pudo consultar notificaciones de Comergio Informa.' });
  }
});

router.get('/posts', async (req, res) => {
  try {
    const actor = getActor(req);
    const posts = await listPosts({
      schoolId: actor.schoolId,
      userId: actor.userId,
      role: actor.role,
      limit: req.query.limit,
    });
    return res.json({ posts, canPublish: canPublishInforma(actor.role) });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'No se pudo cargar el feed de Comergio Informa.' });
  }
});

router.get('/drafts', requirePublisher, async (req, res) => {
  try {
    const drafts = await listDrafts({ limit: req.query.limit });
    return res.json({ drafts });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'No se pudieron cargar los borradores.' });
  }
});

router.post('/drafts/generate', requirePublisher, async (req, res) => {
  try {
    const result = await generateInformaDraft({
      slotKey: `manual-${Date.now()}`,
      force: true,
    });
    return res.status(201).json(result);
  } catch (error) {
    return res.status(500).json({ message: error.message || 'No se pudo generar el borrador.' });
  }
});

router.post('/drafts/:postId/publish', requirePublisher, async (req, res) => {
  try {
    const actor = getActor(req);
    const post = await publishDraft({
      schoolId: actor.schoolId,
      userId: actor.userId,
      role: actor.role,
      postId: req.params.postId,
    });
    return res.json({ post });
  } catch (error) {
    return res.status(400).json({ message: error.message || 'No se pudo publicar el borrador.' });
  }
});

router.patch('/drafts/:postId/discard', requirePublisher, async (req, res) => {
  try {
    const actor = getActor(req);
    const draft = await discardDraft({
      role: actor.role,
      postId: req.params.postId,
    });
    return res.json({ draft });
  } catch (error) {
    return res.status(400).json({ message: error.message || 'No se pudo descartar el borrador.' });
  }
});

router.post('/uploads/media', requirePublisher, (req, res) => {
  uploadInformaMedia.single('file')(req, res, async (error) => {
    if (error) {
      const statusCode = error?.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(statusCode).json({
        message: error.message || 'No se pudo procesar el archivo.',
      });
    }

    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ message: 'Selecciona una imagen o un video.' });
      }

      const mimeType = String(req.file.mimetype || '').toLowerCase();
      const preferredName = String(req.body?.preferredName || req.file.originalname || 'informa').trim();
      const cloudinaryEnabled = isCloudinaryEnabled();

      if (mimeType.startsWith('video/')) {
        const [saved] = await processStoredCampusMaterialFiles([req.file], {
          folder: 'informa',
          requireCloudinary: cloudinaryEnabled,
        });

        if (!saved || saved.kind !== 'video' || !saved.url) {
          return res.status(400).json({ message: 'No se pudo guardar el video.' });
        }

        if (cloudinaryEnabled && saved.storage !== 'cloudinary') {
          return res.status(503).json({
            message: 'Los videos de Comergio Informa solo se pueden guardar en Cloudinary.',
          });
        }

        return res.status(201).json({
          media: {
            kind: 'video',
            src: saved.url,
            thumbUrl: '',
            alt: String(req.body?.alt || '').trim(),
          },
        });
      }

      if (!mimeType.startsWith('image/')) {
        return res.status(400).json({ message: 'Solo se permiten imágenes o videos.' });
      }

      const saved = await processAndStoreUploadedImage({
        file: req.file,
        folder: 'informa',
        preferredName,
        requireCloudinary: cloudinaryEnabled,
      });

      if (cloudinaryEnabled && saved.storage !== 'cloudinary') {
        return res.status(503).json({
          message: 'Las fotos de Comergio Informa solo se pueden guardar en Cloudinary.',
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
        message: processingError.message || 'No se pudo guardar el archivo.',
      });
    }
  });
});

router.post('/posts', requirePublisher, async (req, res) => {
  try {
    const actor = getActor(req);
    const created = await createPost({
      schoolId: actor.schoolId,
      userId: actor.userId,
      role: actor.role,
      title: req.body?.title,
      body: req.body?.body,
      media: req.body?.media,
    });

    return res.status(201).json({ post: created });
  } catch (error) {
    return res.status(400).json({ message: error.message || 'No se pudo publicar en Comergio Informa.' });
  }
});

router.post('/posts/:postId/like', async (req, res) => {
  try {
    const actor = getActor(req);
    const updated = await togglePostLike({
      schoolId: actor.schoolId,
      userId: actor.userId,
      name: actor.name,
      postId: req.params.postId,
    });
    return res.json({ post: updated });
  } catch (error) {
    return res.status(400).json({ message: error.message || 'No se pudo actualizar el like.' });
  }
});

router.post('/posts/:postId/comments', async (req, res) => {
  try {
    const actor = getActor(req);
    const updated = await addComment({
      schoolId: actor.schoolId,
      userId: actor.userId,
      name: actor.name,
      role: actor.role,
      postId: req.params.postId,
      body: req.body?.body,
    });
    return res.json({ post: updated });
  } catch (error) {
    return res.status(400).json({ message: error.message || 'No se pudo comentar.' });
  }
});

router.post('/posts/:postId/comments/:commentId/like', async (req, res) => {
  try {
    const actor = getActor(req);
    const updated = await toggleCommentLike({
      schoolId: actor.schoolId,
      userId: actor.userId,
      name: actor.name,
      role: actor.role,
      postId: req.params.postId,
      commentId: req.params.commentId,
    });
    return res.json({ post: updated });
  } catch (error) {
    return res.status(400).json({ message: error.message || 'No se pudo actualizar el like del comentario.' });
  }
});

router.patch('/posts/:postId/archive', requirePublisher, async (req, res) => {
  try {
    const actor = getActor(req);
    const updated = await archivePost({
      schoolId: actor.schoolId,
      userId: actor.userId,
      role: actor.role,
      postId: req.params.postId,
    });
    return res.json({ post: updated });
  } catch (error) {
    return res.status(400).json({ message: error.message || 'No se pudo archivar la publicación.' });
  }
});

module.exports = router;
