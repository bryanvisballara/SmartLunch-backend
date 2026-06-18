const express = require('express');

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const {
  uploadImageMiddleware,
  processAndStoreUploadedImage,
} = require('../utils/imageUpload');

const router = express.Router();
const COMMUNICATION_FEED_UPLOAD_ROLES = ['academic_secretary', 'admin', 'rectoria', 'direccion', 'coordination'];

router.use(authMiddleware);
router.use(roleMiddleware(COMMUNICATION_FEED_UPLOAD_ROLES));

router.post('/feed-image', (req, res) => {
  uploadImageMiddleware.single('image')(req, res, async (error) => {
    if (error) {
      return res.status(400).json({ message: error.message || 'No se pudo cargar la imagen del comunicado.' });
    }

    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ message: 'No se recibio ningun archivo.' });
      }

      const preferredName = String(req.body?.preferredName || req.file?.originalname || 'comunicado').trim() || 'comunicado';
      const saved = await processAndStoreUploadedImage({
        file: req.file,
        folder: 'communications-feed',
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
      return res.status(400).json({ message: requestError.message || 'No se pudo guardar la imagen del comunicado.' });
    }
  });
});

module.exports = router;
