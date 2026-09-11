import { resolveApiAssetUrl } from './api';

export const MAX_TEACHER_FEED_MEDIA_BYTES = 100 * 1024 * 1024;
export const MAX_TEACHER_FEED_MEDIA_FILES = 8;

export function formatFileSizeMb(sizeBytes) {
  const bytes = Number(sizeBytes || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0';
  }

  return (bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1);
}

export function resolvePlayableFeedVideoUrl(value) {
  const rawUrl = resolveApiAssetUrl(value);
  if (!rawUrl) {
    return '';
  }

  if (!/res\.cloudinary\.com\/[^/]+\/video\/upload\//i.test(rawUrl)) {
    return rawUrl;
  }

  if (/\/video\/upload\/[^/]*?(?:f_mp4|vc_auto|vc_h264)/i.test(rawUrl)) {
    return rawUrl;
  }

  return rawUrl.replace(/\/video\/upload\//i, '/video/upload/f_mp4,vc_auto,q_auto/');
}

export function resolveFeedVideoPosterUrl(value) {
  const rawUrl = resolveApiAssetUrl(value);
  if (!rawUrl) {
    return '';
  }

  if (!/res\.cloudinary\.com\/[^/]+\/video\/upload\//i.test(rawUrl)) {
    return rawUrl;
  }

  const withPoster = /\/video\/upload\/[^/]*so_/i.test(rawUrl)
    ? rawUrl
    : rawUrl.replace(/\/video\/upload\//i, '/video/upload/so_1,w_720,c_fill,q_auto,f_jpg/');

  return withPoster.replace(/\.(mp4|mov|webm|m4v)(\?.*)?$/i, '.jpg$2');
}
