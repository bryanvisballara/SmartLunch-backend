const { findAcademicStructureGradeForStudent, getFeeGradeAliases, normalizeText } = require('./feeGradeMatching');
const { normalizeGradeCourseKey, resolveGradeCourses } = require('./academicGradeCourses');
const { formatStudentGradeFallback } = require('./educationalGradeLabels');

function normalizeLookup(value) {
  return normalizeText(value).replace(/\s+/g, '').toLowerCase();
}

function getAcademicCourseSectionFromKey(courseKey = '') {
  const parts = normalizeText(courseKey).split(':').map((part) => part.trim()).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : '';
}

function buildAcademicCourseDisplayLabel(grade = {}, course = {}, siblingCourses = []) {
  const gradeLabel = normalizeText(grade.label || grade.key);
  const courseLabel = normalizeText(course.label || course.section || course.key);
  const section = normalizeText(course.section || getAcademicCourseSectionFromKey(course.key)).toUpperCase();
  const siblingSections = (Array.isArray(siblingCourses) ? siblingCourses : [])
    .map((item) => normalizeText(item?.section || getAcademicCourseSectionFromKey(item?.key) || item?.label).toUpperCase())
    .filter(Boolean);
  const hasLetteredSibling = siblingSections.some((item) => /^[0-9]+[A-Z]$/.test(item) || /^[A-Z]$/.test(item));

  if (!courseLabel) {
    return gradeLabel;
  }

  if (gradeLabel && courseLabel.toLowerCase() === gradeLabel.toLowerCase() && hasLetteredSibling) {
    return `${gradeLabel}A`;
  }

  if (gradeLabel && /^[0-9]+[A-Z]$/.test(section)) {
    return section;
  }

  if (!gradeLabel || courseLabel.toLowerCase().startsWith(gradeLabel.toLowerCase())) {
    return courseLabel;
  }

  const suffix = section || courseLabel;
  if (/^[a-z0-9]$/i.test(suffix)) {
    return `${gradeLabel}${suffix}`;
  }

  return `${gradeLabel} ${courseLabel}`.trim();
}

function buildAcademicCourseAliases(grade = {}, course = {}, siblingCourses = []) {
  const courseKey = normalizeText(course.key);
  const courseKeyParts = courseKey.split(':').map((part) => part.trim()).filter(Boolean);

  return Array.from(new Set([
    courseKey,
    course.label,
    course.section,
    buildAcademicCourseDisplayLabel(grade, course, siblingCourses),
    getAcademicCourseSectionFromKey(courseKey),
    courseKeyParts.slice(-1).join(':'),
    courseKeyParts.slice(-2).join(':'),
    normalizeGradeCourseKey(courseKey),
  ].map(normalizeLookup).filter(Boolean)));
}

function buildStudentCourseCandidates(student = {}) {
  const grade = normalizeText(student.grade);
  const courseValue = normalizeText(student.course);
  const courseParts = courseValue.split(':').map((part) => part.trim()).filter(Boolean);

  return Array.from(new Set([
    courseValue,
    grade,
    ...courseParts,
    ...getFeeGradeAliases(courseValue),
    ...getFeeGradeAliases(grade),
    courseParts.slice(-1).join(':'),
    courseParts.slice(-2).join(':'),
  ].map(normalizeLookup).filter(Boolean)));
}

function resolveStudentDisplayGrade(student = {}, academicStructure = null) {
  const grade = normalizeText(student.grade);
  const courseValue = normalizeText(student.course);
  const fallback = grade || courseValue || 'Sin grado';
  const structureGrades = Array.isArray(academicStructure?.grades) ? academicStructure.grades : [];
  const matchedGrade = findAcademicStructureGradeForStudent(grade || courseValue, structureGrades);

  if (matchedGrade) {
    const siblingCourses = resolveGradeCourses(matchedGrade);
    const courseCandidates = buildStudentCourseCandidates(student);
    const matchedCourse = siblingCourses.find((item) => {
      const aliases = buildAcademicCourseAliases(matchedGrade, item, siblingCourses);
      return aliases.some((alias) => courseCandidates.includes(alias));
    });

    if (matchedCourse) {
      const courseLabel = normalizeText(matchedCourse.label);
      const structuredLabel = buildAcademicCourseDisplayLabel(matchedGrade, matchedCourse, siblingCourses);
      if (courseLabel) {
        return courseLabel;
      }
      return structuredLabel || normalizeText(matchedCourse.key) || fallback;
    }

    if (siblingCourses.length === 1) {
      return normalizeText(siblingCourses[0].label || matchedGrade.label || matchedGrade.key) || fallback;
    }

    return normalizeText(matchedGrade.label || matchedGrade.key) || fallback;
  }

  return formatStudentGradeFallback(student);
}

module.exports = {
  buildAcademicCourseDisplayLabel,
  resolveStudentDisplayGrade,
};
