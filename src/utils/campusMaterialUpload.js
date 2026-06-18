const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');
const { v2: cloudinary } = require('cloudinary');
const AcademicCommunicationAsset = require('../models/academicCommunicationAsset.model');
const {
  configureCloudinary,
  isCloudinaryEnabled,
  processAndStoreUploadedImage,
} = require('./imageUpload');

const MAX_CAMPUS_MATERIAL_FILE_BYTES = Number(process.env.CAMPUS_MATERIAL_MAX_FILE_BYTES || 100 * 1024 * 1024);
const MAX_CAMPUS_MATERIAL_FILES = Number(process.env.CAMPUS_MATERIAL_MAX_FILES || 6);
const CLOUDINARY_FOLDER = String(process.env.CLOUDINARY_UPLOAD_FOLDER || 'comergio').trim();
const CAMPUS_IMAGE_JPEG_QUALITY = Number(process.env.CAMPUS_IMAGE_JPEG_QUALITY || 86);

const allowedMimeTypes = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-zip-compressed',
  'text/plain',
]);

function getUploadsRootPath() {
  const configured = String(process.env.UPLOADS_ROOT_PATH || '').trim();
  if (configured) {
    return configured.replace(/\/uploads\/?$/i, '/assets');
  }

  return path.resolve(process.cwd(), 'public', 'assets');
}

function getUploadsPublicBaseUrl() {
  const configured = String(process.env.UPLOADS_PUBLIC_BASE_URL || '').trim();
  if (configured) {
    return configured.replace(/\s+/g, '').replace(/\/uploads\/?$/i, '/assets').replace(/\/+$/, '');
  }

  return '/assets';
}

function slugifyFilename(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function sanitizeExtension(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 12);
}

function sanitizeFolder(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-_]/g, '');
}

function buildPublicUrl(folder, filename) {
  const base = getUploadsPublicBaseUrl();
  const cleanFolder = sanitizeFolder(folder);
  const cleanFilename = String(filename || '').trim().replace(/^\/+/, '');

  if (!cleanFolder) {
    return `${base}/${cleanFilename}`.replace(/([^:]\/)\/+/, '$1');
  }

  return `${base}/${cleanFolder}/${cleanFilename}`.replace(/([^:]\/)\/+/, '$1');
}

function detectMaterialKind(file) {
  const mimeType = String(file?.mimetype || '').toLowerCase();

  if (mimeType === 'application/pdf') {
    return 'pdf';
  }
  if (mimeType.startsWith('video/')) {
    return 'video';
  }
  if (mimeType.startsWith('audio/')) {
    return 'audio';
  }
  if (mimeType.startsWith('image/')) {
    return 'image';
  }

  return 'file';
}

async function normalizeCampusImageFile(file) {
  const mimeType = String(file?.mimetype || '').toLowerCase();
  if (!mimeType.startsWith('image/')) {
    return null;
  }

  const buffer = await sharp(file.buffer)
    .rotate()
    .jpeg({ quality: CAMPUS_IMAGE_JPEG_QUALITY, mozjpeg: true })
    .toBuffer();

  return {
    buffer,
    extension: 'jpg',
    mimeType: 'image/jpeg',
    sizeBytes: buffer.length,
  };
}

function isAllowedMaterialFile(file) {
  const mimeType = String(file?.mimetype || '').toLowerCase();
  return (
    mimeType.startsWith('image/') ||
    mimeType.startsWith('video/') ||
    mimeType.startsWith('audio/') ||
    allowedMimeTypes.has(mimeType)
  );
}

function uploadBufferToCloudinary(buffer, { publicId, extension }) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'auto',
        folder: CLOUDINARY_FOLDER,
        public_id: publicId,
        overwrite: true,
        format: extension || undefined,
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }
        return resolve(result);
      }
    );

    stream.end(buffer);
  });
}

const uploadCampusMaterialsMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_CAMPUS_MATERIAL_FILE_BYTES,
    files: MAX_CAMPUS_MATERIAL_FILES,
  },
  fileFilter: (_req, file, callback) => {
    if (isAllowedMaterialFile(file)) {
      return callback(null, true);
    }

    return callback(new Error('Solo se permiten PDF, video, audio, imagenes y archivos de apoyo comunes.'));
  },
});

function shouldPersistAcademicCommunicationAssetsToDatabase({ folder, useDatabaseInProduction }) {
  if (!useDatabaseInProduction || process.env.NODE_ENV !== 'production' || isCloudinaryEnabled()) {
    return false;
  }

  return sanitizeFolder(folder) === 'academic-communications';
}

async function persistAcademicCommunicationAsset({
  schoolId,
  createdByUserId,
  fileName,
  originalName,
  mimeType,
  sizeBytes,
  width,
  height,
  buffer,
}) {
  const normalizedSchoolId = String(schoolId || '').trim();
  if (!normalizedSchoolId) {
    throw new Error('No se pudo identificar el colegio para guardar el archivo del comunicado.');
  }

  const assetPayload = {
    schoolId: normalizedSchoolId,
    fileName,
    originalName: String(originalName || '').trim(),
    mimeType: String(mimeType || 'application/octet-stream').trim() || 'application/octet-stream',
    sizeBytes: Math.max(0, Number(sizeBytes || 0)),
    width: Math.max(0, Number(width || 0)),
    height: Math.max(0, Number(height || 0)),
    data: buffer,
  };

  if (createdByUserId) {
    assetPayload.createdByUserId = createdByUserId;
  }

  await AcademicCommunicationAsset.create(assetPayload);
}

async function processStoredCampusMaterialFiles(files, {
  folder = 'campus-materials',
  requireCloudinary = false,
  useDatabaseInProduction = false,
  schoolId = '',
  createdByUserId = null,
} = {}) {
  const normalizedFiles = Array.isArray(files) ? files.filter(Boolean) : [];
  if (normalizedFiles.length === 0) {
    return [];
  }

  if (requireCloudinary && !isCloudinaryEnabled()) {
    throw new Error('Cloudinary no esta configurado para guardar archivos publicos.');
  }

  const safeFolder = sanitizeFolder(folder);
  const persistToDatabase = shouldPersistAcademicCommunicationAssetsToDatabase({ folder, useDatabaseInProduction });
  const uploadsRootPath = getUploadsRootPath();
  const targetFolderPath = path.join(uploadsRootPath, safeFolder);
  if (!persistToDatabase) {
    await fs.mkdir(targetFolderPath, { recursive: true });
  }

  if (isCloudinaryEnabled()) {
    configureCloudinary();
  }

  const processedFiles = [];
  for (const file of normalizedFiles) {
    const materialKind = detectMaterialKind(file);
    const normalizedImage = await normalizeCampusImageFile(file);
    const originalExtension = normalizedImage?.extension || sanitizeExtension(path.extname(String(file.originalname || '')).replace(/^\./, '')) || 'bin';
    const filenameBase = `${slugifyFilename(path.parse(file.originalname || '').name) || 'campus-file'}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const filename = `${filenameBase}.${originalExtension}`;
    const outputBuffer = normalizedImage?.buffer || file.buffer;
    const outputMimeType = normalizedImage?.mimeType || String(file.mimetype || '').trim();
    const outputSizeBytes = normalizedImage?.sizeBytes || Number(file.size || 0);
    let imageWidth = 0;
    let imageHeight = 0;

    if (materialKind === 'image') {
      try {
        const metadata = await sharp(outputBuffer).metadata();
        imageWidth = Number(metadata?.width || 0);
        imageHeight = Number(metadata?.height || 0);
      } catch (_error) {
        imageWidth = 0;
        imageHeight = 0;
      }
    }

    if (isCloudinaryEnabled()) {
      const uploadResult = await uploadBufferToCloudinary(outputBuffer, { publicId: filenameBase, extension: originalExtension });
      processedFiles.push({
        sourceType: 'file',
        kind: materialKind,
        title: String(file.originalname || '').trim(),
        url: String(uploadResult?.secure_url || '').trim(),
        fileName: filename,
        mimeType: outputMimeType,
        sizeBytes: outputSizeBytes,
        extension: originalExtension,
        storage: 'cloudinary',
      });
      continue;
    }

    if (persistToDatabase) {
      if (materialKind === 'video') {
        throw new Error('Los videos del feed requieren Cloudinary en produccion.');
      }

      await persistAcademicCommunicationAsset({
        schoolId,
        createdByUserId,
        fileName: filename,
        originalName: file.originalname,
        mimeType: outputMimeType,
        sizeBytes: outputSizeBytes,
        width: imageWidth,
        height: imageHeight,
        buffer: outputBuffer,
      });

      processedFiles.push({
        sourceType: 'file',
        kind: materialKind,
        title: String(file.originalname || '').trim(),
        url: buildPublicUrl(safeFolder, filename),
        fileName: filename,
        mimeType: outputMimeType,
        sizeBytes: outputSizeBytes,
        extension: originalExtension,
        storage: 'mongodb',
      });
      continue;
    }

    const outputPath = path.join(targetFolderPath, filename);
    await fs.writeFile(outputPath, outputBuffer);

    processedFiles.push({
      sourceType: 'file',
      kind: materialKind,
      title: String(file.originalname || '').trim(),
      url: buildPublicUrl(safeFolder, filename),
      fileName: filename,
      mimeType: outputMimeType,
      sizeBytes: outputSizeBytes,
      extension: originalExtension,
      storage: 'local',
    });
  }

  return processedFiles;
}

function detectAcademicCommunicationMediaKind(file) {
  const mimeType = String(file?.mimetype || '').toLowerCase();
  if (mimeType.startsWith('video/')) {
    return 'video';
  }
  if (mimeType.startsWith('image/')) {
    return 'image';
  }
  return 'file';
}

async function processAcademicCommunicationMediaFile(file, { preferredName = '' } = {}) {
  if (!file?.buffer) {
    throw new Error('No se recibio ningun archivo.');
  }

  const kind = detectAcademicCommunicationMediaKind(file);
  if (kind === 'image') {
    const saved = await processAndStoreUploadedImage({
      file,
      folder: 'academic-communications',
      preferredName,
      requireCloudinary: true,
    });

    if (saved.storage !== 'cloudinary') {
      throw new Error('Las imagenes del feed solo se pueden guardar en Cloudinary.');
    }

    return {
      kind: 'image',
      url: saved.url,
      thumbUrl: saved.thumbUrl || saved.url,
      storage: saved.storage,
    };
  }

  if (kind === 'video') {
    const [saved] = await processStoredCampusMaterialFiles([file], {
      folder: 'academic-communications',
      requireCloudinary: true,
    });

    if (!saved || saved.kind !== 'video') {
      throw new Error('Solo se permiten imagenes o videos para el feed.');
    }

    if (saved.storage !== 'cloudinary') {
      throw new Error('Los videos del feed solo se pueden guardar en Cloudinary.');
    }

    return {
      kind: 'video',
      url: saved.url,
      thumbUrl: '',
      storage: saved.storage,
    };
  }

  throw new Error('Solo se permiten imagenes o videos para el feed.');
}

module.exports = {
  MAX_CAMPUS_MATERIAL_FILE_BYTES,
  MAX_CAMPUS_MATERIAL_FILES,
  uploadCampusMaterialsMiddleware,
  processStoredCampusMaterialFiles,
  processAcademicCommunicationMediaFile,
};