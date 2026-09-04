const { execFile } = require('child_process');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { promisify } = require('util');
const { v2: cloudinary } = require('cloudinary');
const { configureCloudinary } = require('./imageUpload');

const execFileAsync = promisify(execFile);

function parseCloudinaryUrl(rawUrl) {
  const url = String(rawUrl || '').trim();
  const match = url.match(/^https?:\/\/res\.cloudinary\.com\/([^/]+)\/(image|raw|video|auto)\/upload\/(?:v(\d+)\/)?(.+)$/i);
  if (!match) {
    return null;
  }

  const publicPath = decodeURIComponent(match[4]).replace(/\?.*$/, '');
  const extensionMatch = publicPath.match(/\.([a-z0-9]{2,8})$/i);
  return {
    cloudName: match[1],
    resourceType: String(match[2] || '').toLowerCase(),
    version: match[3] || '',
    publicId: extensionMatch ? publicPath.slice(0, -extensionMatch[0].length) : publicPath,
    format: extensionMatch ? extensionMatch[1].toLowerCase() : '',
    url,
  };
}

function isPdfLikeAttachment(rawUrl, attachment = {}) {
  const parsed = parseCloudinaryUrl(rawUrl);
  const kind = String(attachment?.kind || '').toLowerCase();
  const mimeType = String(attachment?.mimeType || '').toLowerCase();
  const fileName = String(attachment?.fileName || attachment?.title || rawUrl).toLowerCase();
  return (
    parsed?.format === 'pdf'
    || kind === 'pdf'
    || mimeType === 'application/pdf'
    || fileName.endsWith('.pdf')
    || /\.pdf(?:[?#]|$)/i.test(String(rawUrl || ''))
  );
}

function isRestrictedCloudinaryDocumentUrl(rawUrl, attachment = {}) {
  const parsed = parseCloudinaryUrl(rawUrl);
  if (!parsed) {
    return false;
  }

  const pdfLike = isPdfLikeAttachment(rawUrl, attachment);
  if (parsed.resourceType === 'raw') {
    return pdfLike && parsed.format === 'pdf';
  }

  const kind = String(attachment?.kind || '').toLowerCase();
  return (
    pdfLike
    || kind === 'file'
    || ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'txt'].includes(parsed.format)
  );
}

function getCampusDocumentApiBaseUrl() {
  return String(
    process.env.BACKEND_PUBLIC_URL
    || process.env.PUBLIC_BACKEND_URL
    || process.env.API_PUBLIC_URL
    || 'https://smartlunch-backend-3uqr.onrender.com'
  ).trim().replace(/\/+$/, '');
}

function sanitizeDownloadFileName(fileName = 'documento.pdf') {
  const cleaned = String(fileName || 'documento.pdf').replace(/[^\w.\- ()áéíóúñÁÉÍÓÚÑ]+/g, '_').trim() || 'documento.pdf';
  return cleaned.toLowerCase().endsWith('.pdf') ? cleaned : `${cleaned}.pdf`;
}

function buildCampusDocumentDeliveryUrl(attachment = {}) {
  const url = String(attachment?.url || '').trim();
  if (!url || !parseCloudinaryUrl(url) || !isPdfLikeAttachment(url, attachment)) {
    return url;
  }

  const fileName = sanitizeDownloadFileName(attachment.fileName || attachment.title || 'documento.pdf');
  const params = new URLSearchParams({
    u: url,
    n: fileName,
  });
  return `${getCampusDocumentApiBaseUrl()}/campus/materials/file?${params.toString()}`;
}

async function downloadCloudinaryImageAssetBuffer(publicId) {
  configureCloudinary();
  const zipUrl = cloudinary.utils.download_zip_url({
    public_ids: [publicId],
    resource_type: 'image',
    flatten_folders: true,
  });
  const zipResponse = await fetch(zipUrl, { redirect: 'follow' });
  if (!zipResponse.ok) {
    throw new Error(`No se pudo descargar el archivo original de Cloudinary (${zipResponse.status}).`);
  }

  const zipBuffer = Buffer.from(await zipResponse.arrayBuffer());
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cld-doc-'));
  const zipPath = path.join(tmpRoot, 'asset.zip');
  await fs.writeFile(zipPath, zipBuffer);
  await execFileAsync('unzip', ['-o', zipPath, '-d', tmpRoot]);
  const entries = (await fs.readdir(tmpRoot)).filter((name) => name !== 'asset.zip');
  const preferred = entries.find((name) => /\.pdf$/i.test(name)) || entries[0];
  if (!preferred) {
    throw new Error('El archivo descargado de Cloudinary llegó vacío.');
  }

  const fileBuffer = await fs.readFile(path.join(tmpRoot, preferred));
  await fs.rm(tmpRoot, { recursive: true, force: true });
  return {
    buffer: fileBuffer,
    fileName: preferred,
  };
}

function uploadRawBufferToCloudinary(buffer, { publicId, folder }) {
  configureCloudinary();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'raw',
        folder,
        public_id: publicId,
        overwrite: true,
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

async function migrateCloudinaryImageDocumentToRaw(rawUrl, attachment = {}) {
  const parsed = parseCloudinaryUrl(rawUrl);
  if (!parsed) {
    return String(rawUrl || '').trim();
  }
  if (parsed.resourceType === 'raw' && parsed.format !== 'pdf') {
    return parsed.url;
  }
  if (!isRestrictedCloudinaryDocumentUrl(rawUrl, attachment) && parsed.resourceType === 'raw') {
    return parsed.url;
  }

  const downloaded = await downloadCloudinaryImageAssetBuffer(parsed.publicId);
  const folder = parsed.publicId.includes('/') ? parsed.publicId.split('/').slice(0, -1).join('/') : '';
  const baseName = String(parsed.publicId.split('/').pop() || 'documento')
    .replace(/\.[a-z0-9]{2,8}$/i, '');
  const uploaded = await uploadRawBufferToCloudinary(downloaded.buffer, {
    publicId: baseName,
    folder,
  });
  return String(uploaded?.secure_url || '').trim() || parsed.url;
}

async function loadCampusDocumentBuffer(rawUrl, attachment = {}) {
  const storedUrl = String(rawUrl || '').trim();
  const parsed = parseCloudinaryUrl(storedUrl);
  if (!parsed) {
    throw new Error('Archivo no válido.');
  }

  const expectedCloudName = String(process.env.CLOUDINARY_CLOUD_NAME || '').trim();
  if (expectedCloudName && parsed.cloudName !== expectedCloudName) {
    throw new Error('Archivo no válido.');
  }

  const migratedUrl = isRestrictedCloudinaryDocumentUrl(storedUrl, attachment)
    ? await migrateCloudinaryImageDocumentToRaw(storedUrl, attachment)
    : storedUrl;
  const migratedParsed = parseCloudinaryUrl(migratedUrl) || parsed;

  if (migratedParsed.resourceType === 'raw' && migratedParsed.format !== 'pdf') {
    const response = await fetch(migratedUrl, { redirect: 'follow' });
    if (response.ok) {
      return {
        buffer: Buffer.from(await response.arrayBuffer()),
        fileName: sanitizeDownloadFileName(attachment.fileName || attachment.title || `${migratedParsed.publicId.split('/').pop()}.pdf`),
        mimeType: 'application/pdf',
      };
    }
  }

  const downloaded = await downloadCloudinaryImageAssetBuffer(parsed.publicId);
  return {
    buffer: downloaded.buffer,
    fileName: sanitizeDownloadFileName(attachment.fileName || attachment.title || downloaded.fileName),
    mimeType: 'application/pdf',
  };
}

function serializeCampusAttachment(attachment = {}) {
  const url = String(attachment?.url || '').trim();
  return {
    sourceType: String(attachment?.sourceType || 'file').trim() || 'file',
    kind: String(attachment?.kind || 'file').trim() || 'file',
    title: String(attachment?.title || '').trim(),
    url: buildCampusDocumentDeliveryUrl({ ...attachment, url }),
    fileName: String(attachment?.fileName || '').trim(),
    mimeType: String(attachment?.mimeType || '').trim(),
    sizeBytes: Number(attachment?.sizeBytes || 0),
    extension: String(attachment?.extension || '').trim(),
    storage: String(attachment?.storage || '').trim(),
  };
}

module.exports = {
  parseCloudinaryUrl,
  isRestrictedCloudinaryDocumentUrl,
  isPdfLikeAttachment,
  migrateCloudinaryImageDocumentToRaw,
  buildCampusDocumentDeliveryUrl,
  loadCampusDocumentBuffer,
  serializeCampusAttachment,
};
