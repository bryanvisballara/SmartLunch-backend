const { normalizeStoredImageUrl, processAndStoreUploadedImage, isCloudinaryEnabled } = require('../utils/imageUpload');
const {
  processStoredCampusMaterialFiles,
  resolveUploadMimeType,
} = require('../utils/campusMaterialUpload');
const {
  createFeedMediaUploadSignature,
  isOwnedCloudinaryMediaUrl,
  buildCloudinaryVideoPosterUrl,
  describeCampusMediaUploadError,
} = require('../utils/cloudinaryFeedUpload');

function normalizeText(value) {
  return String(value || '').trim();
}

function isValidPublicMediaUrl(url) {
  const text = normalizeText(url);
  return /^https?:\/\//i.test(text) || text.startsWith('/');
}

function normalizeParentFeedMedia(mediaItems) {
  if (!Array.isArray(mediaItems)) {
    return [];
  }

  return mediaItems
    .map((item) => {
      const kind = normalizeText(item?.kind).toLowerCase() === 'video' ? 'video' : 'image';
      const src = normalizeStoredImageUrl(item?.src || item?.url || '');
      const thumbUrl = kind === 'image'
        ? normalizeStoredImageUrl(item?.thumbUrl || item?.src || item?.url || '')
        : normalizeStoredImageUrl(item?.thumbUrl || '');

      if (!src) {
        return null;
      }

      return {
        kind,
        src,
        thumbUrl,
        alt: normalizeText(item?.alt || item?.title || ''),
      };
    })
    .filter(Boolean)
    .slice(0, 8);
}

function serializeParentFeedMediaItem({ kind, url, thumbUrl, title }, altDefault = 'Publicación') {
  const mediaKind = String(kind || '').trim().toLowerCase() === 'video' ? 'video' : 'image';
  return {
    kind: mediaKind,
    src: url,
    thumbUrl: mediaKind === 'video'
      ? (thumbUrl || buildCloudinaryVideoPosterUrl(url))
      : (thumbUrl || url),
    alt: normalizeText(title) || altDefault,
  };
}

async function registerRemoteParentFeedMedia(req, res, { altDefault = 'Publicación' } = {}) {
  const remoteMedia = Array.isArray(req.body?.remoteMedia) ? req.body.remoteMedia : [];
  if (!remoteMedia.length) {
    return res.status(400).json({ message: 'No se recibio ningun archivo.' });
  }

  const media = [];
  for (const item of remoteMedia) {
    const kind = normalizeText(item?.kind).toLowerCase() === 'video' ? 'video' : 'image';
    const url = normalizeText(item?.url || item?.src);
    const thumbUrl = normalizeText(item?.thumbUrl);

    if (!isOwnedCloudinaryMediaUrl(url, kind)) {
      return res.status(400).json({ message: 'El archivo subido no es valido. Intenta de nuevo.' });
    }

    media.push(serializeParentFeedMediaItem({
      kind,
      url,
      thumbUrl,
      title: item?.title || item?.alt || '',
    }, altDefault));
  }

  if (!media.length) {
    return res.status(400).json({ message: 'Solo se pueden subir fotos o videos para publicaciones.' });
  }

  return res.status(201).json({ media });
}

async function processParentFeedMediaFiles(req, res, { preferredNameDefault = 'publicacion', altDefault = 'Publicación' } = {}) {
  try {
    const incomingFiles = Array.isArray(req.files) ? req.files : [];

    if (!incomingFiles.length) {
      return res.status(400).json({ message: 'No se recibio ningun archivo.' });
    }

    incomingFiles.forEach((file) => {
      const resolvedMimeType = resolveUploadMimeType(file);
      if (resolvedMimeType) {
        file.mimetype = resolvedMimeType;
      }
    });

    const hasUnsupportedFile = incomingFiles.some((file) => {
      const mimeType = normalizeText(file?.mimetype).toLowerCase();
      return !mimeType.startsWith('image/') && !mimeType.startsWith('video/');
    });

    if (hasUnsupportedFile) {
      return res.status(400).json({ message: 'Solo se pueden subir fotos o videos para publicaciones.' });
    }

    const uploadedFiles = [];
    for (const file of incomingFiles) {
      const mimeType = normalizeText(file?.mimetype).toLowerCase();
      const preferredName = normalizeText(req.body?.preferredName) || normalizeText(file.originalname) || preferredNameDefault;
      const requireCloudinary = isCloudinaryEnabled();

      if (mimeType.startsWith('video/')) {
        const [saved] = await processStoredCampusMaterialFiles([file], {
          folder: 'academic-communications',
          requireCloudinary,
        });

        if (!saved || saved.kind !== 'video' || !isValidPublicMediaUrl(saved.url)) {
          throw new Error('No se pudo guardar el video.');
        }

        if (requireCloudinary && saved.storage !== 'cloudinary') {
          throw new Error('No se pudo guardar el video.');
        }

        uploadedFiles.push({
          kind: 'video',
          url: saved.url,
          thumbUrl: buildCloudinaryVideoPosterUrl(saved.url),
          title: String(file.originalname || '').trim(),
        });
        continue;
      }

      const saved = await processAndStoreUploadedImage({
        file,
        folder: 'academic-communications',
        preferredName,
        requireCloudinary,
      });

      if (requireCloudinary && (saved.storage !== 'cloudinary' || !/^https?:\/\//i.test(saved.url || ''))) {
        throw new Error('No se pudo guardar la imagen.');
      }

      if (!isValidPublicMediaUrl(saved.url)) {
        throw new Error('No se pudo guardar la imagen.');
      }

      uploadedFiles.push({
        kind: 'image',
        url: saved.url,
        thumbUrl: saved.thumbUrl || saved.url,
        title: String(file.originalname || '').trim(),
      });
    }

    const media = uploadedFiles
      .filter((file) => ['image', 'video'].includes(file.kind))
      .map((file) => serializeParentFeedMediaItem(file, altDefault));

    if (!media.length) {
      return res.status(400).json({ message: 'Solo se pueden subir fotos o videos para publicaciones.' });
    }

    return res.status(201).json({ media });
  } catch (error) {
    return res.status(400).json({ message: describeCampusMediaUploadError(error) });
  }
}

function createParentFeedMediaSignature(req, res) {
  try {
    const kind = normalizeText(req.body?.kind).toLowerCase() === 'image' ? 'image' : 'video';
    return res.status(200).json(createFeedMediaUploadSignature({
      kind,
      fileName: normalizeText(req.body?.fileName),
    }));
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      enabled: false,
      message: describeCampusMediaUploadError(error),
    });
  }
}

module.exports = {
  createParentFeedMediaSignature,
  describeCampusMediaUploadError,
  normalizeParentFeedMedia,
  processParentFeedMediaFiles,
  registerRemoteParentFeedMedia,
  serializeParentFeedMediaItem,
};
