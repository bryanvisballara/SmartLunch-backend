import api from '../lib/api';
import { formatFileSizeMb, MAX_TEACHER_FEED_MEDIA_BYTES } from '../lib/feedMedia';
import { uploadFeedFileToCloudinary } from '../campus/services/cloudinaryFeedUpload';

const NURSING_FEED_MEDIA_UPLOAD_TIMEOUT_MS = 300000;

function isVideoFeedFile(file) {
  const mimeType = String(file?.type || '').split(';')[0].trim().toLowerCase();
  const fileName = String(file?.name || '').toLowerCase();
  return mimeType.startsWith('video/') || /\.(mp4|m4v|mov|webm)$/i.test(fileName);
}

function assertFeedMediaSize(file) {
  if (Number(file?.size || 0) <= MAX_TEACHER_FEED_MEDIA_BYTES) {
    return;
  }

  throw new Error(
    `El archivo "${file?.name || 'video'}" pesa ${formatFileSizeMb(file.size)} MB. El máximo permitido es ${Math.round(MAX_TEACHER_FEED_MEDIA_BYTES / (1024 * 1024))} MB.`
  );
}

async function uploadNursingFeedVideosDirectly(files, { onProgress } = {}) {
  const remoteMedia = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const spec = await api.post('/nursing/parent-feed-requests/media-signature', {
      kind: 'video',
      fileName: file.name,
    }).then((response) => response.data);

    if (!spec?.enabled || !spec.signature) {
      throw new Error(spec?.message || 'No se pudo preparar la subida del video.');
    }

    const uploaded = await uploadFeedFileToCloudinary(file, spec, {
      onProgress: (ratio) => {
        const overall = (index + ratio) / files.length;
        onProgress?.(overall);
      },
    });

    remoteMedia.push({
      kind: 'video',
      url: uploaded.secure_url,
      title: file.name,
    });
  }

  return api.post('/nursing/parent-feed-requests/media', { remoteMedia }).then((response) => response.data);
}

export const searchNursingStudents = (params = {}) => api.get('/nursing/students', { params });
export const getNursingStudentHistory = (studentId) => api.get(`/nursing/students/${studentId}/history`);
export const createNursingVisit = (data) => api.post('/nursing/visits', data);
export const getNursingSummary = () => api.get('/nursing/summary');
export const getParentNursingRecords = (params = {}) => api.get('/nursing/parent/records', { params });
export const getNursingStudentMedicalProfileHistory = (studentId, params = {}) =>
  api.get(`/nursing/students/${studentId}/medical-profile/history`, { params });
export const getNursingMedicalProfileSignatures = (params = {}) =>
  api.get('/nursing/medical-profile-signatures', { params });

export const getNursingPublicationAudiences = () =>
  api.get('/nursing/publications/audiences').then((response) => response.data);

export const getNursingParentFeedRequests = () =>
  api.get('/nursing/parent-feed-requests').then((response) => response.data);

export const createNursingParentFeedRequest = (payload) =>
  api.post('/nursing/parent-feed-requests', payload).then((response) => response.data);

export async function uploadNursingParentFeedMedia(files, { onProgress } = {}) {
  const selectedFiles = Array.from(files || []);
  selectedFiles.forEach(assertFeedMediaSize);

  const videos = selectedFiles.filter(isVideoFeedFile);
  const images = selectedFiles.filter((file) => !isVideoFeedFile(file));
  const media = [];

  if (videos.length) {
    try {
      const uploadedVideos = await uploadNursingFeedVideosDirectly(videos, {
        onProgress: images.length
          ? (ratio) => onProgress?.(ratio * 0.85)
          : onProgress,
      });
      media.push(...(uploadedVideos.media || []));
    } catch (directError) {
      const status = Number(directError?.response?.status || 0);
      const canUseServerFallback = status === 503
        || /no esta configurado|no está configurado/i.test(String(directError?.response?.data?.message || directError?.message || ''));
      if (!canUseServerFallback) {
        throw new Error(directError?.response?.data?.message || directError?.message || 'No se pudo subir el video.');
      }

      const formData = new FormData();
      videos.forEach((file, index) => {
        formData.append('files', file, String(file?.name || `video-${Date.now()}-${index}.mp4`));
      });
      const uploadedVideos = await api.post('/nursing/parent-feed-requests/media', formData, {
        timeout: NURSING_FEED_MEDIA_UPLOAD_TIMEOUT_MS,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        onUploadProgress: (event) => {
          if (!event.total) {
            return;
          }
          const ratio = event.loaded / event.total;
          onProgress?.(images.length ? ratio * 0.85 : ratio);
        },
      }).then((response) => response.data);
      media.push(...(uploadedVideos.media || []));
    }
  }

  if (images.length) {
    const formData = new FormData();
    images.forEach((file, index) => {
      formData.append('files', file, String(file?.name || `media-${Date.now()}-${index}.bin`));
    });
    const uploadedImages = await api.post('/nursing/parent-feed-requests/media', formData, {
      timeout: NURSING_FEED_MEDIA_UPLOAD_TIMEOUT_MS,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      onUploadProgress: (event) => {
        if (!event.total) {
          return;
        }
        const ratio = videos.length ? 0.85 + ((event.loaded / event.total) * 0.15) : event.loaded / event.total;
        onProgress?.(ratio);
      },
    }).then((response) => response.data);
    media.push(...(uploadedImages.media || []));
  }

  onProgress?.(1);
  return { media };
}

export const uploadNursingVisitImage = (file, preferredName = '') => {
  const formData = new FormData();
  formData.append('image', file);
  if (preferredName) {
    formData.append('preferredName', preferredName);
  }
  return api.post('/nursing/uploads/image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
