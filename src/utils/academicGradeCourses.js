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

function gradeUsesImplicitCourse(grade = {}) {
  const rawCourses = (Array.isArray(grade.courses) ? grade.courses : [])
    .filter((course) => normalizeText(course?.status || 'active') !== 'archived');
  return rawCourses.length === 0 && Boolean(normalizeText(grade.key || grade.label));
}

function studentHasAssignedCourseInGrade(student = {}, grade = {}) {
  const courses = resolveGradeCourses(grade);
  if (courses.length === 0) {
    return false;
  }

  if (courses.length === 1 && courses[0].isImplicit) {
    return true;
  }

  const studentCourseKey = normalizeGradeCourseKey(student?.course);
  if (!studentCourseKey) {
    return false;
  }

  return courses.some((course) => normalizeGradeCourseKey(course.key) === studentCourseKey);
}

function resolveStudentCourseLabel(student = {}, grade = {}) {
  const courses = resolveGradeCourses(grade);
  const studentCourseKey = normalizeGradeCourseKey(student?.course);

  if (studentCourseKey) {
    const matchedCourse = courses.find((course) => normalizeGradeCourseKey(course.key) === studentCourseKey);
    if (matchedCourse) {
      return matchedCourse.label || matchedCourse.key;
    }
  }

  if (courses.length === 1 && courses[0].isImplicit) {
    return courses[0].label || normalizeText(grade.label || grade.key);
  }

  return '';
}

function resolveStudentCourseKey(student = {}, grade = {}) {
  const courses = resolveGradeCourses(grade);
  const studentCourseKey = normalizeGradeCourseKey(student?.course);

  if (studentCourseKey && courses.some((course) => normalizeGradeCourseKey(course.key) === studentCourseKey)) {
    return studentCourseKey;
  }

  if (courses.length === 1 && courses[0].isImplicit) {
    return normalizeGradeCourseKey(courses[0].key);
  }

  return '';
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
  gradeUsesImplicitCourse,
  normalizeGradeCourseKey,
  resolveGradeCourses,
  resolveStudentCourseKey,
  resolveStudentCourseLabel,
  studentHasAssignedCourseInGrade,
};
