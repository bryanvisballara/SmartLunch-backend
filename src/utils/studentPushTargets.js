function normalizeText(value) {
  return String(value || '').trim();
}

function buildStudentAcademicPath(academicView = 'academic-performance', extraQuery = '') {
  const view = normalizeText(academicView) || 'academic-performance';
  const extra = normalizeText(extraQuery);
  const query = extra ? `&${extra}` : '';
  return `/student/academic?academicView=${encodeURIComponent(view)}${query}`;
}

function buildStudentPushUrl(notificationType = '', options = {}) {
  const type = normalizeText(notificationType);
  const postId = normalizeText(options.postId);

  switch (type) {
    case 'campus.grade_published':
      return buildStudentAcademicPath('academic-grades');

    case 'campus.attendance_recorded':
      return buildStudentAcademicPath('academic-attendance');

    case 'campus.teacher_post_published':
      if (postId) {
        return buildStudentAcademicPath('academic-assignments', `assignmentId=${encodeURIComponent(postId)}`);
      }
      return buildStudentAcademicPath('academic-calendar');

    case 'academic.calendar_assignment':
      if (postId || normalizeText(options.assignmentId)) {
        return buildStudentAcademicPath(
          'academic-assignments',
          `assignmentId=${encodeURIComponent(postId || options.assignmentId)}`
        );
      }
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
