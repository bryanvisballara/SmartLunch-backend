function normalizeText(value) {
  return String(value || '').trim();
}

function withStudentQuery(path, studentId) {
  const normalizedStudentId = normalizeText(studentId);
  if (!normalizedStudentId) {
    return path;
  }

  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}studentId=${encodeURIComponent(normalizedStudentId)}`;
}

function buildAcademicPath({ academicView = 'academic-performance', studentId } = {}) {
  const view = normalizeText(academicView) || 'academic-performance';
  return withStudentQuery(`/parent/academic?academicView=${encodeURIComponent(view)}`, studentId);
}

function getCampusPostCategoryLabel(postType = '') {
  const normalized = normalizeText(postType).toLowerCase();

  if (['quiz', 'quices', 'examen', 'evaluacion', 'evaluación'].some((token) => normalized.includes(token))) {
    return 'Quiz';
  }

  if (['tarea', 'task', 'homework', 'entrega'].some((token) => normalized.includes(token))) {
    return 'Tarea';
  }

  if (['taller', 'workshop'].some((token) => normalized.includes(token))) {
    return 'Taller';
  }

  if (['proyecto', 'project', 'exposicion', 'exposición'].some((token) => normalized.includes(token))) {
    return 'Proyecto';
  }

  if (['aviso', 'announcement', 'comunicado'].some((token) => normalized.includes(token))) {
    return 'Aviso';
  }

  if (normalized === 'material') {
    return 'Material';
  }

  return normalizeText(postType) || 'Publicación';
}

function isEvaluativeCampusPostType(postType = '') {
  const normalized = normalizeText(postType).toLowerCase();
  return Boolean(normalized) && !['aviso', 'announcement', 'material', 'comunicado'].includes(normalized);
}

function buildParentPushUrl(notificationType = '', options = {}) {
  const type = normalizeText(notificationType);
  const studentId = options.studentId;

  switch (type) {
    case 'academic.communication':
      return withStudentQuery('/parent', studentId);

    case 'academic.billing.charge_created':
    case 'academic.billing.monthly_statement':
    case 'academic.billing.enrollment':
    case 'academic.billing.reminder':
    case 'academic.billing.follow_up':
    case 'academic.billing.payment_registered':
      return withStudentQuery('/parent/finance', studentId);

    case 'campus.grade_published':
      return buildAcademicPath({ academicView: 'academic-grades', studentId });

    case 'campus.attendance_recorded':
      return buildAcademicPath({ academicView: 'academic-attendance', studentId });

    case 'campus.teacher_post_published':
      return isEvaluativeCampusPostType(options.postType)
        ? buildAcademicPath({ academicView: 'academic-calendar', studentId })
        : withStudentQuery('/parent', studentId);

    case 'academic.calendar_assignment':
      return buildAcademicPath({ academicView: 'academic-calendar', studentId });

    case 'academic.course_assigned':
      return buildAcademicPath({ academicView: 'academic-performance', studentId });

    case 'nursing.visit':
      return withStudentQuery('/parent/enfermeria', studentId);

    case 'psychology.case_note':
      return withStudentQuery('/parent/wellbeing', studentId);

    case 'campus.discipline_observation_parent':
      return withStudentQuery('/parent/coexistence', studentId);

  case 'school_route.on_way':
  case 'school_route.arrived':
  case 'school_route.picked_up':
  case 'school_route.skipped':
    return withStudentQuery('/parent/transport', studentId);

    default:
      return withStudentQuery('/parent', studentId);
  }
}

module.exports = {
  buildAcademicPath,
  buildParentPushUrl,
  getCampusPostCategoryLabel,
  isEvaluativeCampusPostType,
};
