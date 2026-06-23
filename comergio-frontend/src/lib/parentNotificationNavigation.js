import {
  buildParentSectionNavigateTarget,
  resolveParentNotificationSection,
} from './parentSectionRouting';

function normalizeText(value) {
  return String(value || '').trim();
}

function buildParentNotificationSectionPath(sectionKey, extraQuery = '') {
  const basePath = buildParentSectionNavigateTarget('/parent', sectionKey);
  const normalizedExtraQuery = normalizeText(extraQuery);
  if (!normalizedExtraQuery) {
    return basePath;
  }

  const separator = basePath.includes('?') ? '&' : '?';
  return `${basePath}${separator}${normalizedExtraQuery}`;
}

export function resolveParentNotificationPath(payload = {}) {
  const explicitUrl = normalizeText(payload.url);
  if (explicitUrl.startsWith('/')) {
    return explicitUrl;
  }

  const type = normalizeText(payload.type);
  const studentId = normalizeText(payload.studentId);
  const withStudent = (path) => {
    if (!studentId) {
      return path;
    }

    const separator = path.includes('?') ? '&' : '?';
    return `${path}${separator}studentId=${encodeURIComponent(studentId)}`;
  };

  switch (type) {
    case 'academic.communication':
      return withStudent('/parent');

    case 'academic.billing.charge_created':
    case 'academic.billing.monthly_statement':
    case 'academic.billing.enrollment':
    case 'academic.billing.reminder':
    case 'academic.billing.follow_up':
    case 'academic.billing.payment_registered':
      return withStudent(buildParentNotificationSectionPath('finance'));

    case 'campus.grade_published':
      return withStudent(buildParentNotificationSectionPath('academic', 'academicView=academic-grades'));

    case 'campus.attendance_recorded':
      return withStudent(buildParentNotificationSectionPath('academic', 'academicView=academic-attendance'));

    case 'campus.teacher_post_published':
    case 'academic.calendar_assignment':
      return withStudent(buildParentNotificationSectionPath('academic', 'academicView=academic-calendar'));

    case 'academic.course_assigned':
      return withStudent(buildParentNotificationSectionPath('academic', 'academicView=academic-performance'));

    case 'nursing.visit':
      return withStudent('/parent/enfermeria');

    case 'psychology.case_note':
      return withStudent('/parent/wellbeing');

    case 'campus.discipline_observation_parent':
      return withStudent('/parent/coexistence');

    case 'school_route.on_way':
    case 'school_route.arrived':
    case 'school_route.picked_up':
    case 'school_route.skipped':
      return withStudent(buildParentNotificationSectionPath('transport'));

    default:
      return withStudent('/parent');
  }
}

export { resolveParentNotificationSection };

export function readParentNotificationLaunchParams(search = '', pathname = '') {
  const params = new URLSearchParams(search);
  return {
    studentId: normalizeText(params.get('studentId')),
    academicView: normalizeText(params.get('academicView')),
    section: resolveParentNotificationSection(pathname, search),
  };
}
