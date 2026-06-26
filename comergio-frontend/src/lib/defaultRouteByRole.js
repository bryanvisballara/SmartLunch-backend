const INSTITUTIONAL_PLACEHOLDER_ROLES = [];

export function getDefaultRouteByRole(role) {
  if (role === 'vendor') {
    return '/daily-closure';
  }

  if (role === 'merienda_operator') {
    return '/meriendas/operator';
  }

  if (role === 'parent') {
    return '/parent';
  }

  if (role === 'admin') {
    return '/admin';
  }

  if (role === 'super_admin') {
    return '/super-admin';
  }

  if (role === 'rectoria') {
    return '/rectoria';
  }

  if (role === 'coordination') {
    return '/coordinacion';
  }

  if (role === 'direccion') {
    return '/direccion';
  }

  if (role === 'academic_secretary' || role === 'billing') {
    return role === 'billing' ? '/cartera' : '/academic-secretary';
  }

  if (role === 'admissions') {
    return '/academic-secretary/admissions';
  }

  if (role === 'teacher') {
    return '/campus/teacher';
  }

  if (role === 'student') {
    return '/campus/student';
  }

  if (role === 'school_route') {
    return '/campus/route';
  }

  if (role === 'nursing') {
    return '/enfermeria';
  }

  if (role === 'psychology') {
    return '/psicologia';
  }

  if (role === 'human_resources') {
    return '/recursos-humanos';
  }

  if (INSTITUTIONAL_PLACEHOLDER_ROLES.includes(role)) {
    return '/portal-institucional';
  }

  return '/pos';
}

export { INSTITUTIONAL_PLACEHOLDER_ROLES };
