import api from '../../lib/api';
import { formatFileSizeMb, MAX_TEACHER_FEED_MEDIA_BYTES } from '../../lib/feedMedia';
import { uploadFeedFileToCloudinary } from './cloudinaryFeedUpload';

const TEACHER_FEED_MEDIA_UPLOAD_TIMEOUT_MS = 300000;

function isVideoFeedFile(file) {
  const mimeType = String(file?.type || '').split(';')[0].trim().toLowerCase();
  const fileName = String(file?.name || '').toLowerCase();
  return mimeType.startsWith('video/') || /\.(mp4|m4v|mov|webm)$/i.test(fileName);
}

function assertTeacherFeedMediaSize(file) {
  if (Number(file?.size || 0) <= MAX_TEACHER_FEED_MEDIA_BYTES) {
    return;
  }

  throw new Error(
    `El archivo "${file?.name || 'video'}" pesa ${formatFileSizeMb(file.size)} MB. El máximo permitido es ${Math.round(MAX_TEACHER_FEED_MEDIA_BYTES / (1024 * 1024))} MB.`
  );
}

async function uploadTeacherFeedVideosDirectly(files, { onProgress } = {}) {
  const remoteMedia = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const spec = await api.post('/campus/teacher/parent-feed-requests/media-signature', {
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

  return api.post('/campus/teacher/parent-feed-requests/media', { remoteMedia }).then((response) => response.data);
}

export function getCampusMe() {
  return api.get('/campus/me').then((response) => response.data);
}

export function getCampusNavigation() {
  return api.get('/campus/navigation').then((response) => response.data);
}

export function getCampusTeacherOverview() {
  return api.get('/campus/teacher/overview', { timeout: 45000 }).then((response) => response.data);
}

export function getCampusTeacherOverviewShell() {
  return api.get('/campus/teacher/overview/shell', { timeout: 30000 }).then((response) => response.data);
}

export function getCampusTeacherOverviewMetrics() {
  return api.get('/campus/teacher/overview/metrics', { timeout: 45000 }).then((response) => response.data);
}

export function getCampusTeacherCalendar(params = {}) {
  return api.get('/campus/teacher/calendar', { params }).then((response) => response.data);
}

export function uploadCampusTeacherProfilePhoto(file, preferredName = '') {
  const formData = new FormData();
  formData.append('image', file);

  if (preferredName) {
    formData.append('preferredName', preferredName);
  }

  return api.post('/campus/teacher/profile-photo', formData, { timeout: 120000 }).then((response) => response.data);
}

export function getCampusCoordinationTeachers() {
  return api.get('/campus/coordination/teachers').then((response) => response.data);
}

export function getCampusCoordinationCourses({ resync = false } = {}) {
  return api.get('/campus/coordination/courses', {
    params: resync ? { resync: 1 } : undefined,
    timeout: resync ? 120000 : 45000,
  }).then((response) => response.data);
}

export function resyncCampusCoordinationCourses() {
  return getCampusCoordinationCourses({ resync: true });
}

export function getCampusCoordinationDashboard() {
  return api.get('/campus/coordination/dashboard').then((response) => response.data);
}

export function updateCampusCoordinationCourse(courseId, payload) {
  return api.patch(`/campus/coordination/courses/${courseId}`, payload).then((response) => response.data);
}

export function getCampusTeacherCourseDetail(courseId) {
  return api.get(`/campus/teacher/courses/${courseId}`).then((response) => response.data);
}

export function getCampusTeacherAssignmentSubmissions(courseId) {
  return api.get(`/campus/teacher/courses/${courseId}/assignment-submissions`).then((response) => response.data);
}

export function getCampusTeacherAttendance(params = {}) {
  return api.get('/campus/teacher/attendance', { params }).then((response) => response.data);
}

export function saveCampusTeacherAttendance(payload) {
  return api.post('/campus/teacher/attendance', payload).then((response) => response.data);
}

export function updateCampusTeacherGradingScheme(courseId, payload) {
  return api.patch(`/campus/teacher/courses/${courseId}/grading-scheme`, payload).then((response) => response.data);
}

export function updateCampusTeacherAcademicContent(courseId, payload) {
  return api.patch(`/campus/teacher/courses/${courseId}/academic-content`, payload).then((response) => response.data);
}

export function uploadCampusTeacherAcademicContentMedia(courseId, files) {
  const formData = new FormData();
  Array.from(files || []).forEach((file, index) => {
    const fileName = String(file?.name || `material-${Date.now()}-${index}.bin`);
    formData.append('files', file, fileName);
  });
  return api.post(`/campus/teacher/courses/${courseId}/academic-content/media`, formData, { timeout: 120000 }).then((response) => response.data);
}

export function updateCampusTeacherClassSchedule(courseId, payload) {
  return api.patch(`/campus/teacher/courses/${courseId}/class-schedule`, payload).then((response) => response.data);
}

export function saveCampusTeacherStudentGrades(courseId, studentId, payload) {
  return api.post(`/campus/teacher/courses/${courseId}/students/${studentId}/grades`, payload).then((response) => response.data);
}

export function getCampusTeacherCourseReportCards(courseId, params = {}) {
  return api.get(`/campus/teacher/courses/${courseId}/report-cards`, { params }).then((response) => response.data);
}

export function saveCampusTeacherCourseReportCard(courseId, payload) {
  return api.post(`/campus/teacher/courses/${courseId}/report-cards`, payload).then((response) => response.data);
}

export function getCampusTeacherHeadroomReportCards(params = {}) {
  return api.get('/campus/teacher/headroom/report-cards', { params }).then((response) => response.data);
}

export function saveCampusTeacherHeadroomReportCard(payload) {
  return api.post('/campus/teacher/headroom/report-cards', payload).then((response) => response.data);
}

export function getCampusTeacherCourseFlyLock(courseId) {
  return api.get(`/campus/teacher/courses/${courseId}/fly-lock`).then((response) => response.data);
}

export function updateCampusTeacherCourseFlyLock(courseId, payload) {
  return api.put(`/campus/teacher/courses/${courseId}/fly-lock`, payload).then((response) => response.data);
}

export function createCampusTeacherPost(payload) {
  const hasFormData = typeof FormData !== 'undefined' && payload instanceof FormData;
  if (hasFormData) {
    const courseId = String(payload.get('courseId') || '').trim();
    const query = courseId ? `?courseId=${encodeURIComponent(courseId)}` : '';
    return api.post(`/campus/teacher/posts${query}`, payload, { timeout: 120000 }).then((response) => response.data);
  }

  return api.post('/campus/teacher/posts', payload).then((response) => response.data);
}

export function updateCampusTeacherPost(postId, payload) {
  const hasFormData = typeof FormData !== 'undefined' && payload instanceof FormData;
  if (hasFormData) {
    return api.patch(`/campus/teacher/posts/${postId}`, payload, { timeout: 120000 }).then((response) => response.data);
  }

  return api.patch(`/campus/teacher/posts/${postId}`, payload).then((response) => response.data);
}

export function getCampusTeacherParentFeedRequests() {
  return api.get('/campus/teacher/parent-feed-requests').then((response) => response.data);
}

export function getCampusTeacherFamilyFeed() {
  return api.get('/campus/teacher/family-feed').then((response) => response.data);
}

export function toggleCampusTeacherFamilyFeedLike(communicationId) {
  return api.post(`/campus/teacher/family-feed/${communicationId}/like`).then((response) => response.data);
}

export function createCampusTeacherFamilyFeedComment(communicationId, data) {
  return api.post(`/campus/teacher/family-feed/${communicationId}/comments`, data).then((response) => response.data);
}

export function deleteCampusTeacherFamilyFeedComment(communicationId, commentId) {
  return api.delete(`/campus/teacher/family-feed/${communicationId}/comments/${commentId}`).then((response) => response.data);
}

export function toggleCampusTeacherFamilyFeedCommentLike(communicationId, commentId) {
  return api.post(`/campus/teacher/family-feed/${communicationId}/comments/${commentId}/like`).then((response) => response.data);
}

export async function uploadCampusTeacherParentFeedMedia(files, { onProgress } = {}) {
  const selectedFiles = Array.from(files || []);
  selectedFiles.forEach(assertTeacherFeedMediaSize);

  const videos = selectedFiles.filter(isVideoFeedFile);
  const images = selectedFiles.filter((file) => !isVideoFeedFile(file));
  const media = [];

  if (videos.length) {
    try {
      const uploadedVideos = await uploadTeacherFeedVideosDirectly(videos, {
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
        const message = directError?.response?.data?.message || directError?.message || 'No se pudo subir el video.';
        throw new Error(message);
      }

      const formData = new FormData();
      videos.forEach((file, index) => {
        formData.append('files', file, String(file?.name || `video-${Date.now()}-${index}.mp4`));
      });
      const uploadedVideos = await api.post('/campus/teacher/parent-feed-requests/media', formData, {
        timeout: TEACHER_FEED_MEDIA_UPLOAD_TIMEOUT_MS,
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
    const uploadedImages = await api.post('/campus/teacher/parent-feed-requests/media', formData, {
      timeout: TEACHER_FEED_MEDIA_UPLOAD_TIMEOUT_MS,
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

export function createCampusTeacherParentFeedRequest(payload) {
  return api.post('/campus/teacher/parent-feed-requests', payload).then((response) => response.data);
}

export function getCampusTeacherDisciplineObservations() {
  return api.get('/campus/teacher/discipline-observations').then((response) => response.data);
}

export function createCampusTeacherDisciplineObservation(payload) {
  return api.post('/campus/teacher/discipline-observations', payload).then((response) => response.data);
}

export function getCampusDisciplineObservations(params = {}) {
  return api.get('/campus/discipline-observations', { params })
    .then((response) => response.data)
    .catch((error) => {
      if (error?.response?.status === 404 || error?.response?.status === 405) {
        return { observations: [] };
      }
      return Promise.reject(error);
    });
}

export function getCampusCoexistencePolicy() {
  return api.get('/campus/coexistence-policy').then((response) => response.data);
}

export function getCampusCoexistenceScores() {
  return api.get('/campus/coexistence-scores').then((response) => response.data);
}

export function updateCampusCoexistencePolicy(payload) {
  return api.put('/campus/coexistence-policy', payload).then((response) => response.data);
}

export function getCampusAttendanceReport(params = {}) {
  return api.get('/campus/attendance-report', { params })
    .then((response) => response.data)
    .catch((error) => {
      if (error?.response?.status === 404 || error?.response?.status === 405) {
        return {
          date: params.date || '',
          attendanceType: 'guidance_routine',
          attendanceTypeLabel: 'Rutina de orientacion',
          summary: {
            sessionsSubmitted: 0,
            coursesMissing: 0,
            studentsMarked: 0,
            present: 0,
            late: 0,
            absent: 0,
            excused: 0,
          },
          sessions: [],
        };
      }
      return Promise.reject(error);
    });
}

export function getCampusSchoolRouteManifest() {
  return api.get('/campus/school-route/manifest').then((response) => response.data);
}

export function addCampusSchoolRouteStop(payload) {
  return api.post('/campus/school-route/stops', payload).then((response) => response.data);
}

export function updateCampusSchoolRouteStop(stopId, payload) {
  return api.patch(`/campus/school-route/stops/${stopId}`, payload).then((response) => response.data);
}

export function removeCampusSchoolRouteStop(stopId) {
  return api.delete(`/campus/school-route/stops/${stopId}`).then((response) => response.data);
}

export function reorderCampusSchoolRouteStops(stopIds) {
  return api.post('/campus/school-route/reorder', { stopIds }).then((response) => response.data);
}

export function runCampusSchoolRouteStopAction(stopId, action, extra = {}) {
  return api.post(`/campus/school-route/stops/${stopId}/action`, { action, ...extra }).then((response) => response.data);
}

export function resetCampusSchoolRouteDay() {
  return api.post('/campus/school-route/reset-day').then((response) => response.data);
}

export function listArenaQuizzes() {
  return api.get('/arena/teacher/quizzes').then((response) => response.data);
}

export function getArenaQuiz(quizId) {
  return api.get(`/arena/teacher/quizzes/${quizId}`).then((response) => response.data);
}

export function createArenaQuiz(payload) {
  return api.post('/arena/teacher/quizzes', payload).then((response) => response.data);
}

export function updateArenaQuiz(quizId, payload) {
  return api.put(`/arena/teacher/quizzes/${quizId}`, payload).then((response) => response.data);
}

export function deleteArenaQuiz(quizId) {
  return api.delete(`/arena/teacher/quizzes/${quizId}`).then((response) => response.data);
}

export function playArenaQuiz(quizId) {
  return api.post(`/arena/teacher/quizzes/${quizId}/play`).then((response) => response.data);
}

export function getActiveArenaHostSession() {
  return api.get('/arena/teacher/sessions/active').then((response) => response.data);
}

export function getArenaHostSession(sessionId) {
  return api.get(`/arena/teacher/sessions/${sessionId}`).then((response) => response.data);
}

export function advanceArenaHostSession(sessionId, action) {
  return api.post(`/arena/teacher/sessions/${sessionId}/advance`, action ? { action } : {}).then((response) => response.data);
}

export function endArenaHostSession(sessionId) {
  return api.post(`/arena/teacher/sessions/${sessionId}/end`).then((response) => response.data);
}

export function uploadArenaQuestionImage(file) {
  const formData = new FormData();
  formData.append('files', file);
  return api.post('/arena/teacher/media', formData, { timeout: 120000 }).then((response) => response.data);
}