import api from '../lib/api';

export function getPreschoolBulletinCatalog() {
  return api.get('/campus/preschool-bulletin/catalog').then((response) => response.data);
}

export function getPreschoolBulletinTemplate(gradeKey, periodKey) {
  return api.get(`/campus/preschool-bulletin/templates/${encodeURIComponent(gradeKey)}`, {
    params: { periodKey },
  }).then((response) => response.data);
}

export function savePreschoolBulletinTemplate(gradeKey, payload) {
  return api.put(`/campus/preschool-bulletin/templates/${encodeURIComponent(gradeKey)}`, payload).then((response) => response.data);
}

export function getTeacherPreschoolBulletinWorkspace(params = {}) {
  return api.get('/campus/preschool-bulletin/teacher/workspace', { params }).then((response) => response.data);
}

export function saveTeacherPreschoolBulletin(payload) {
  return api.post('/campus/preschool-bulletin/teacher/workspace', payload).then((response) => response.data);
}
