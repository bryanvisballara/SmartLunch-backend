function normalizeText(value) {
  return String(value || '').trim();
}

function buildStudentAcademicPath(academicView = 'academic-performance') {
  const view = normalizeText(academicView) || 'academic-performance';
  return `/student?academicView=${encodeURIComponent(view)}`;
}

function buildStudentPushUrl(notificationType = '') {
  const type = normalizeText(notificationType);

  switch (type) {
    case 'campus.grade_published':
      return buildStudentAcademicPath('academic-grades');

    case 'campus.attendance_recorded':
      return buildStudentAcademicPath('academic-attendance');

    case 'campus.teacher_post_published':
    case 'academic.calendar_assignment':
      return buildStudentAcademicPath('academic-calendar');

    case 'academic.course_assigned':
      return buildStudentAcademicPath('academic-performance');

    default:
      return buildStudentAcademicPath('academic-performance');
  }
}

module.exports = {
  buildStudentAcademicPath,
  buildStudentPushUrl,
};
