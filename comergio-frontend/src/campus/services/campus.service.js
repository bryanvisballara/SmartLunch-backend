import api from '../../lib/api';

export function getCampusMe() {
  return api.get('/campus/me').then((response) => response.data);
}

export function getCampusNavigation() {
  return api.get('/campus/navigation').then((response) => response.data);
}

export function getCampusTeacherOverview() {
  return api.get('/campus/teacher/overview').then((response) => response.data);
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

  return api.post('/campus/teacher/profile-photo', formData).then((response) => response.data);
}

export function getCampusCoordinationTeachers() {
  return api.get('/campus/coordination/teachers').then((response) => response.data);
}

export function getCampusCoordinationCourses() {
  return api.get('/campus/coordination/courses').then((response) => response.data);
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

export function updateCampusTeacherClassSchedule(courseId, payload) {
  return api.patch(`/campus/teacher/courses/${courseId}/class-schedule`, payload).then((response) => response.data);
}

export function saveCampusTeacherStudentGrades(courseId, studentId, payload) {
  return api.post(`/campus/teacher/courses/${courseId}/students/${studentId}/grades`, payload).then((response) => response.data);
}

export function createCampusTeacherPost(payload) {
  return api.post('/campus/teacher/posts', payload).then((response) => response.data);
}

export function updateCampusTeacherPost(postId, payload) {
  return api.patch(`/campus/teacher/posts/${postId}`, payload).then((response) => response.data);
}

export function getCampusTeacherParentFeedRequests() {
  return api.get('/campus/teacher/parent-feed-requests').then((response) => response.data);
}

export function uploadCampusTeacherParentFeedMedia(files) {
  const formData = new FormData();
  Array.from(files || []).forEach((file) => formData.append('files', file));
  return api.post('/campus/teacher/parent-feed-requests/media', formData).then((response) => response.data);
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

export function runCampusSchoolRouteStopAction(stopId, action) {
  return api.post(`/campus/school-route/stops/${stopId}/action`, { action }).then((response) => response.data);
}

export function resetCampusSchoolRouteDay() {
  return api.post('/campus/school-route/reset-day').then((response) => response.data);
}