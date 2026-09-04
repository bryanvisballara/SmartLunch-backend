const { execFile } = require('child_process');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { promisify } = require('util');
const { v2: cloudinary } = require('cloudinary');
const { configureCloudinary } = require('./imageUpload');

const execFileAsync = promisify(execFile);

const MIME_BY_EXTENSION = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
  txt: 'text/plain',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
};

const BLOCKED_PUBLIC_EXTENSIONS = new Set(['pdf', 'zip']);

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

function resolveAttachmentExtension(attachment = {}, rawUrl = '') {
  const fromField = String(attachment?.extension || '').replace(/^\./, '').toLowerCase();
  const fromName = path.extname(String(attachment?.fileName || attachment?.title || '')).replace(/^\./, '').toLowerCase();
  const fromUrl = parseCloudinaryUrl(rawUrl)?.format || '';
  return fromField || fromName || fromUrl || '';
}

function resolveAttachmentMimeType(attachment = {}, rawUrl = '') {
  const explicit = String(attachment?.mimeType || '').trim().toLowerCase();
  if (explicit && explicit !== 'text/uri-list' && explicit !== 'application/octet-stream') {
    return explicit;
  }
  return MIME_BY_EXTENSION[resolveAttachmentExtension(attachment, rawUrl)] || 'application/octet-stream';
}

function isPdfLikeAttachment(rawUrl, attachment = {}) {
  const extension = resolveAttachmentExtension(attachment, rawUrl);
  const kind = String(attachment?.kind || '').toLowerCase();
  const mimeType = String(attachment?.mimeType || '').toLowerCase();
  return (
    extension === 'pdf'
    || kind === 'pdf'
    || mimeType === 'application/pdf'
    || /\.pdf(?:[?#]|$)/i.test(String(rawUrl || ''))
  );
}

function isRestrictedCloudinaryDocumentUrl(rawUrl, attachment = {}) {
  const parsed = parseCloudinaryUrl(rawUrl);
  if (!parsed) {
    return false;
  }

  const extension = resolveAttachmentExtension(attachment, rawUrl);
  const kind = String(attachment?.kind || '').toLowerCase();
  const blockedExtension = BLOCKED_PUBLIC_EXTENSIONS.has(extension) || BLOCKED_PUBLIC_EXTENSIONS.has(parsed.format);
  if (parsed.resourceType === 'raw') {
    return blockedExtension;
  }

  return (
    blockedExtension
    || isPdfLikeAttachment(rawUrl, attachment)
    || kind === 'file'
    || ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'txt'].includes(extension || parsed.format)
  );
}

function shouldProxyCampusAttachment(attachment = {}) {
  const url = String(attachment?.url || '').trim();
  const sourceType = String(attachment?.sourceType || 'file').toLowerCase();
  const kind = String(attachment?.kind || '').toLowerCase();
  if (!parseCloudinaryUrl(url)) {
    return false;
  }
  if (sourceType === 'link' || kind === 'link') {
    return isRestrictedCloudinaryDocumentUrl(url, attachment);
  }
  if (kind === 'image' || kind === 'video') {
    return isRestrictedCloudinaryDocumentUrl(url, attachment);
  }
  return true;
}

function unwrapCampusDocumentDeliveryUrl(rawUrl = '') {
  const url = String(rawUrl || '').trim();
  if (!url) {
    return '';
  }

  try {
    const parsed = new URL(url, 'https://api.comergio.com');
    if (parsed.pathname.replace(/\/+$/, '').endsWith('/campus/materials/file')) {
      const original = String(parsed.searchParams.get('u') || '').trim();
      if (original) {
        return original;
      }
    }
  } catch (_error) {
    // Keep the incoming URL when it is not a delivery wrapper.
  }

  return url;
}

function getCampusDocumentApiBaseUrl() {
  return String(
    process.env.API_PUBLIC_URL
    || process.env.CAMPUS_DOCUMENT_PUBLIC_URL
    || 'https://api.comergio.com'
  ).trim().replace(/\/+$/, '');
}

function sanitizeDownloadFileName(fileName = 'archivo', extension = '') {
  const cleaned = String(fileName || 'archivo').replace(/[^\w.\- ()áéíóúñÁÉÍÓÚÑ]+/g, '_').trim() || 'archivo';
  const ext = String(extension || '').replace(/^\./, '').toLowerCase();
  if (!ext) {
    return cleaned;
  }
  return cleaned.toLowerCase().endsWith(`.${ext}`) ? cleaned : `${cleaned}.${ext}`;
}

function buildCampusDocumentDeliveryUrl(attachment = {}) {
  const url = String(attachment?.url || '').trim();
  if (!url || !shouldProxyCampusAttachment({ ...attachment, url })) {
    return url;
  }

  const extension = resolveAttachmentExtension(attachment, url);
  const fileName = sanitizeDownloadFileName(
    attachment.fileName || attachment.title || 'archivo',
    extension,
  );
  const params = new URLSearchParams({
    u: url,
    n: fileName,
  });
  return `${getCampusDocumentApiBaseUrl()}/campus/materials/file?${params.toString()}`;
}

async function downloadCloudinaryAssetBuffer(publicId, resourceType = 'image') {
  configureCloudinary();
  const zipUrl = cloudinary.utils.download_zip_url({
    public_ids: [publicId],
    resource_type: resourceType,
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
  const preferred = entries[0];
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
  if (parsed.resourceType === 'raw' && !BLOCKED_PUBLIC_EXTENSIONS.has(parsed.format)) {
    return parsed.url;
  }
  if (!isRestrictedCloudinaryDocumentUrl(rawUrl, attachment) && parsed.resourceType === 'raw') {
    return parsed.url;
  }

  let downloaded;
  try {
    downloaded = await downloadCloudinaryAssetBuffer(parsed.publicId, parsed.resourceType === 'raw' ? 'raw' : 'image');
  } catch (_error) {
    downloaded = await downloadCloudinaryAssetBuffer(parsed.publicId, parsed.resourceType === 'raw' ? 'image' : 'raw');
  }

  const folder = parsed.publicId.includes('/') ? parsed.publicId.split('/').slice(0, -1).join('/') : '';
  const baseName = String(parsed.publicId.split('/').pop() || 'archivo')
    .replace(/\.[a-z0-9]{2,8}$/i, '');
  const uploaded = await uploadRawBufferToCloudinary(downloaded.buffer, {
    publicId: baseName,
    folder,
  });
  return String(uploaded?.secure_url || '').trim() || parsed.url;
}

async function fetchBufferIfPublic(url) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    return null;
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) {
    return null;
  }
  return buffer;
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

  const extension = resolveAttachmentExtension(attachment, storedUrl);
  const mimeType = resolveAttachmentMimeType(attachment, storedUrl);
  const fileName = sanitizeDownloadFileName(
    attachment.fileName || attachment.title || parsed.publicId.split('/').pop() || 'archivo',
    extension,
  );

  const publicBuffer = await fetchBufferIfPublic(storedUrl);
  if (publicBuffer) {
    return { buffer: publicBuffer, fileName, mimeType };
  }

  if (isRestrictedCloudinaryDocumentUrl(storedUrl, attachment)) {
    const migratedUrl = await migrateCloudinaryImageDocumentToRaw(storedUrl, attachment);
    const migratedBuffer = await fetchBufferIfPublic(migratedUrl);
    if (migratedBuffer) {
      return { buffer: migratedBuffer, fileName, mimeType };
    }
  }

  for (const resourceType of ['image', 'raw', 'video']) {
    try {
      const downloaded = await downloadCloudinaryAssetBuffer(parsed.publicId, resourceType);
      return {
        buffer: downloaded.buffer,
        fileName: sanitizeDownloadFileName(attachment.fileName || attachment.title || downloaded.fileName, extension),
        mimeType,
      };
    } catch (_error) {
      // Try the next Cloudinary resource type.
    }
  }

  throw new Error('No se pudo abrir el archivo.');
}

function serializeCampusAttachment(attachment = {}) {
  const url = unwrapCampusDocumentDeliveryUrl(attachment?.url);
  const extension = resolveAttachmentExtension(attachment, url);
  return {
    sourceType: String(attachment?.sourceType || 'file').trim() || 'file',
    kind: String(attachment?.kind || 'file').trim() || 'file',
    title: String(attachment?.title || '').trim(),
    url: buildCampusDocumentDeliveryUrl({ ...attachment, url }),
    fileName: sanitizeDownloadFileName(attachment.fileName || attachment.title || 'archivo', extension),
    mimeType: resolveAttachmentMimeType({ ...attachment, url }, url),
    sizeBytes: Number(attachment?.sizeBytes || 0),
    extension: String(attachment?.extension || extension || '').trim(),
    storage: String(attachment?.storage || '').trim(),
  };
}

module.exports = {
  parseCloudinaryUrl,
  isRestrictedCloudinaryDocumentUrl,
  isPdfLikeAttachment,
  shouldProxyCampusAttachment,
  unwrapCampusDocumentDeliveryUrl,
  migrateCloudinaryImageDocumentToRaw,
  buildCampusDocumentDeliveryUrl,
  loadCampusDocumentBuffer,
  serializeCampusAttachment,
};
