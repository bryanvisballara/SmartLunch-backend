const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');

const MAX_UPLOAD_BYTES = Number(process.env.UPLOADS_MAX_FILE_BYTES || 5 * 1024 * 1024);
const MAX_WIDTH = Number(process.env.UPLOADS_MAX_WIDTH_PX || 600);
const WEBP_QUALITY = Number(process.env.UPLOADS_WEBP_QUALITY || 78);
const THUMB_MAX_WIDTH = Number(process.env.UPLOADS_THUMB_MAX_WIDTH_PX || 250);
const THUMB_WEBP_QUALITY = Number(process.env.UPLOADS_THUMB_WEBP_QUALITY || 70);
const DEFAULT_FOLDER = '';

const storage = multer.memoryStorage();

const uploadImageMiddleware = multer({
  storage,
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    files: 1,
  },
  fileFilter: (req, file, callback) => {
    if (String(file?.mimetype || '').startsWith('image/')) {
      return callback(null, true);
    }
    return callback(new Error('Solo se permiten archivos de imagen.'));
  },
});

function slugifyFilename(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function getUploadsRootPath() {
  const configured = String(process.env.UPLOADS_ROOT_PATH || '').trim();
  if (configured) {
    return configured;
  }

  return path.resolve(process.cwd(), 'public', 'assets');
}

function getUploadsPublicBaseUrl() {
  const configured = String(process.env.UPLOADS_PUBLIC_BASE_URL || '').trim();
  if (configured) {
    // Guard against accidental spaces in env var values like "https://site.com /uploads".
    return configured.replace(/\s+/g, '').replace(/\/+$/, '');
  }

  return '/assets';
}

function sanitizeFolder(value) {
  const folder = String(value || DEFAULT_FOLDER)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-_]/g, '');

  // Hostinger requirement: keep files directly under /assets (no subfolders).
  return '';
}

function buildPublicImageUrl(folder, filename) {
  const base = getUploadsPublicBaseUrl();
  const cleanFolder = sanitizeFolder(folder);
  const cleanFilename = String(filename || '').trim().replace(/^\/+/, '');

  if (!cleanFolder) {
    return `${base}/${cleanFilename}`.replace(/([^:]\/)\/+/, '$1');
  }

  return `${base}/${cleanFolder}/${cleanFilename}`.replace(/([^:]\/)\/+/, '$1');
}

function normalizeStoredImageUrl(value) {
  const imageUrl = String(value || '').trim();
  if (!imageUrl) {
    return '';
  }

  if (imageUrl.startsWith('data:')) {
    return '';
  }

  const looksLikeHttp = /^https?:\/\//i.test(imageUrl);
  const looksLikeRelative = imageUrl.startsWith('/');
  if (!looksLikeHttp && !looksLikeRelative) {
    return '';
  }

  return imageUrl;
}

function deriveThumbUrlFromImageUrl(value) {
  const imageUrl = normalizeStoredImageUrl(value);
  if (!imageUrl) {
    return '';
  }

  return imageUrl.replace(/\.webp$/i, '_thumb.webp');
}

function validateIncomingImageUrl(value) {
  const imageUrl = String(value || '').trim();
  if (!imageUrl) {
    return '';
  }

  if (imageUrl.startsWith('data:')) {
    throw new Error('No se permite guardar imagenes en base64. Sube la foto y guarda la URL publica.');
  }

  const looksLikeHttp = /^https?:\/\//i.test(imageUrl);
  const looksLikeRelative = imageUrl.startsWith('/');
  if (!looksLikeHttp && !looksLikeRelative) {
    throw new Error('imageUrl debe ser una URL publica valida.');
  }

  return imageUrl;
}

async function processAndStoreUploadedImage({ file, folder = DEFAULT_FOLDER, preferredName = '' }) {
  if (!file?.buffer) {
    throw new Error('No se recibio ningun archivo de imagen.');
  }

  const safeFolder = sanitizeFolder(folder);
  const uploadsRootPath = getUploadsRootPath();
  const targetFolderPath = path.join(uploadsRootPath, safeFolder);
  await fs.mkdir(targetFolderPath, { recursive: true });

  const nameBase = slugifyFilename(preferredName || path.parse(file.originalname || '').name) || 'image';
  const unique = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const filenameBase = `${nameBase}-${unique}`;
  const filename = `${filenameBase}.webp`;
  const thumbFilename = `${filenameBase}_thumb.webp`;
  const outputPath = path.join(targetFolderPath, filename);
  const thumbOutputPath = path.join(targetFolderPath, thumbFilename);

  const metadata = await sharp(file.buffer).rotate().metadata();

  await sharp(file.buffer)
    .rotate()
    .resize({
      width: MAX_WIDTH,
      withoutEnlargement: true,
      fit: 'inside',
    })
    .webp({ quality: WEBP_QUALITY })
    .toFile(outputPath);

  await sharp(file.buffer)
    .rotate()
    .resize({
      width: THUMB_MAX_WIDTH,
      withoutEnlargement: true,
      fit: 'inside',
    })
    .webp({ quality: THUMB_WEBP_QUALITY })
    .toFile(thumbOutputPath);

  return {
    filename,
    thumbFilename,
    folder: safeFolder,
    width: Number(metadata?.width || 0),
    height: Number(metadata?.height || 0),
    format: 'webp',
    url: buildPublicImageUrl(safeFolder, filename),
    thumbUrl: buildPublicImageUrl(safeFolder, thumbFilename),
  };
}

module.exports = {
  uploadImageMiddleware,
  processAndStoreUploadedImage,
  normalizeStoredImageUrl,
  deriveThumbUrlFromImageUrl,
  validateIncomingImageUrl,
  getUploadsRootPath,
};
