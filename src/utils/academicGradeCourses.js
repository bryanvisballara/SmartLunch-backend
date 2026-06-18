function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeGradeCourseKey(value) {
  return normalizeText(value).toUpperCase();
}

function resolveGradeCourses(grade = {}) {
  const gradeKey = normalizeText(grade.key || grade.label);
  const gradeLabel = normalizeText(grade.label || grade.key);
  const rawCourses = (Array.isArray(grade.courses) ? grade.courses : [])
    .filter((course) => normalizeText(course?.status || 'active') !== 'archived')
    .map((course, courseIndex) => ({
      key: normalizeGradeCourseKey(course.key || course.label),
      label: normalizeText(course.label || course.key),
      section: normalizeText(course.section).toUpperCase(),
      headroomTeacherUserId: normalizeText(course.headroomTeacherUserId),
      order: Number(course.order || (courseIndex + 1) * 10),
      isImplicit: false,
    }))
    .filter((course) => course.key);

  if (rawCourses.length > 0) {
    return rawCourses;
  }

  if (!gradeKey) {
    return [];
  }

  return [{
    key: normalizeGradeCourseKey(gradeKey),
    label: gradeLabel || gradeKey,
    section: '',
    headroomTeacherUserId: '',
    order: 10,
    isImplicit: true,
  }];
}

function gradeHasCourse(grade = {}, courseKey = '') {
  const normalizedCourseKey = normalizeGradeCourseKey(courseKey);
  if (!normalizedCourseKey) {
    return false;
  }

  return resolveGradeCourses(grade).some((course) => normalizeGradeCourseKey(course.key) === normalizedCourseKey);
}

module.exports = {
  gradeHasCourse,
  normalizeGradeCourseKey,
  resolveGradeCourses,
};
