const CLOUDINARY_CHUNK_BYTES = 8 * 1024 * 1024;

function createUniqueUploadId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildCloudinaryUploadUrl(cloudName, resourceType) {
  return `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;
}

function appendSignedFields(formData, spec) {
  formData.append('api_key', spec.apiKey);
  formData.append('timestamp', String(spec.timestamp));
  formData.append('signature', spec.signature);
  formData.append('folder', spec.folder);
  formData.append('public_id', spec.publicId);
  if (spec.format) {
    formData.append('format', spec.format);
  }
}

function describeCloudinaryUploadError(message) {
  const text = String(message || '');
  if (/file size too large|maximum file size/i.test(text)) {
    return 'El video supera el máximo de 100 MB.';
  }
  if (/invalid|unsupported|format|codec/i.test(text)) {
    return 'Este formato de video no se pudo procesar. Usa MP4 o MOV e inténtalo de nuevo.';
  }
  if (/timeout|timed out/i.test(text)) {
    return 'La subida tardó demasiado. Intenta de nuevo o usa un video más liviano.';
  }
  return text || 'No se pudo guardar el video.';
}

async function parseCloudinaryResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(describeCloudinaryUploadError(payload?.error?.message));
  }
  return payload;
}

async function uploadCloudinaryChunk({ url, spec, chunk, fileName, uniqueId, start, end, total }) {
  const formData = new FormData();
  appendSignedFields(formData, spec);
  formData.append('file', new Blob([chunk]), fileName);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Unique-Upload-Id': uniqueId,
        'Content-Range': `bytes ${start}-${end}/${total}`,
      },
      body: formData,
    });
    return parseCloudinaryResponse(response);
  } catch (_error) {
    throw new Error('No se pudo subir el video. Revisa tu conexión e inténtalo de nuevo.');
  }
}

export async function uploadFeedFileToCloudinary(file, spec, { onProgress } = {}) {
  const resourceType = spec.resourceType === 'image' ? 'image' : 'video';
  const url = buildCloudinaryUploadUrl(spec.cloudName, resourceType);
  const total = Number(file.size || 0);
  const fileName = String(file.name || spec.fileName || `media-${Date.now()}`);

  if (total <= CLOUDINARY_CHUNK_BYTES) {
    const formData = new FormData();
    appendSignedFields(formData, spec);
    formData.append('file', file, fileName);

    try {
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
      });
      onProgress?.(1);
      return parseCloudinaryResponse(response);
    } catch (_error) {
      throw new Error('No se pudo subir el video. Revisa tu conexión e inténtalo de nuevo.');
    }
  }

  const uniqueId = createUniqueUploadId();
  let uploaded = 0;
  let lastResult = null;

  while (uploaded < total) {
    const end = Math.min(uploaded + CLOUDINARY_CHUNK_BYTES, total);
    const chunk = file.slice(uploaded, end);
    lastResult = await uploadCloudinaryChunk({
      url,
      spec,
      chunk,
      fileName,
      uniqueId,
      start: uploaded,
      end: end - 1,
      total,
    });
    uploaded = end;
    onProgress?.(uploaded / total);
  }

  return lastResult;
}
