const crypto = require('crypto');
const { v2: cloudinary } = require('cloudinary');
const { configureCloudinary, isCloudinaryEnabled } = require('./imageUpload');
const { parseCloudinaryUrl } = require('./cloudinaryDocumentDelivery');

const CLOUDINARY_FOLDER = String(process.env.CLOUDINARY_UPLOAD_FOLDER || 'comergio').trim();
const MAX_FEED_MEDIA_FILE_BYTES = Number(process.env.CAMPUS_MATERIAL_MAX_FILE_BYTES || 100 * 1024 * 1024);

function getCloudinaryRuntimeConfig() {
  configureCloudinary();
  const config = cloudinary.config() || {};
  return {
    cloudName: String(config.cloud_name || process.env.CLOUDINARY_CLOUD_NAME || '').trim(),
    apiKey: String(config.api_key || process.env.CLOUDINARY_API_KEY || '').trim(),
    apiSecret: String(config.api_secret || process.env.CLOUDINARY_API_SECRET || '').trim(),
    folder: CLOUDINARY_FOLDER,
  };
}

function createFeedMediaUploadSignature({ kind, fileName } = {}) {
  if (!isCloudinaryEnabled()) {
    const error = new Error('Cloudinary no esta configurado para guardar videos del feed.');
    error.statusCode = 503;
    throw error;
  }

  const { cloudName, apiKey, apiSecret, folder } = getCloudinaryRuntimeConfig();
  if (!cloudName || !apiKey || !apiSecret) {
    const error = new Error('Cloudinary no esta configurado para guardar videos del feed.');
    error.statusCode = 503;
    throw error;
  }

  const resourceType = String(kind || '').trim().toLowerCase() === 'video' ? 'video' : 'image';
  const timestamp = Math.round(Date.now() / 1000);
  const publicId = `publicacion-${resourceType}-${timestamp}-${crypto.randomBytes(4).toString('hex')}`;
  const paramsToSign = {
    timestamp,
    folder,
    public_id: publicId,
  };

  if (resourceType === 'video') {
    paramsToSign.format = 'mp4';
  }

  return {
    enabled: true,
    cloudName,
    apiKey,
    timestamp,
    signature: cloudinary.utils.api_sign_request(paramsToSign, apiSecret),
    folder,
    publicId,
    resourceType,
    format: resourceType === 'video' ? 'mp4' : '',
    fileName: String(fileName || '').trim(),
    maxFileBytes: MAX_FEED_MEDIA_FILE_BYTES,
  };
}

function isOwnedCloudinaryMediaUrl(url, expectedKind = '') {
  const parsed = parseCloudinaryUrl(url);
  if (!parsed) {
    return false;
  }

  const { cloudName } = getCloudinaryRuntimeConfig();
  if (cloudName && parsed.cloudName !== cloudName) {
    return false;
  }

  const kind = String(expectedKind || '').trim().toLowerCase();
  if (kind === 'video') {
    return parsed.resourceType === 'video';
  }
  if (kind === 'image') {
    return parsed.resourceType === 'image';
  }

  return parsed.resourceType === 'image' || parsed.resourceType === 'video';
}

function buildCloudinaryVideoPosterUrl(url) {
  const normalized = String(url || '').trim();
  if (!normalized || !/res\.cloudinary\.com\/[^/]+\/video\/upload\//i.test(normalized)) {
    return '';
  }

  if (/\/video\/upload\/[^/]*so_/i.test(normalized)) {
    return normalized.replace(/\.(mp4|mov|webm|m4v)(\?.*)?$/i, '.jpg$2');
  }

  return normalized
    .replace(/\/video\/upload\//i, '/video/upload/so_1,w_720,c_fill,q_auto,f_jpg/')
    .replace(/\.(mp4|mov|webm|m4v)(\?.*)?$/i, '.jpg$2');
}

function describeCampusMediaUploadError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');

  if (code === 'LIMIT_FILE_SIZE' || /file too large|file size too large/i.test(message)) {
    return `El archivo supera el maximo de ${Math.round(MAX_FEED_MEDIA_FILE_BYTES / (1024 * 1024))} MB.`;
  }

  if (code === 'LIMIT_FILE_COUNT' || code === 'LIMIT_UNEXPECTED_FILE') {
    return 'Puedes adjuntar menos archivos por carga. Intenta de nuevo.';
  }

  if (/timeout|etimedout|econnaborted|socket hang up/i.test(message)) {
    return 'La subida tardo demasiado. Intenta de nuevo o usa un video mas liviano.';
  }

  if (/cloudinary/i.test(message) && /not configured|no esta configurado/i.test(message)) {
    return 'No se pudo guardar el video. Intenta de nuevo en unos segundos.';
  }

  return message || 'No se pudieron subir los archivos.';
}

module.exports = {
  MAX_FEED_MEDIA_FILE_BYTES,
  createFeedMediaUploadSignature,
  isOwnedCloudinaryMediaUrl,
  buildCloudinaryVideoPosterUrl,
  describeCampusMediaUploadError,
};
