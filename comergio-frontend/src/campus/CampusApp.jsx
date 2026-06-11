import { useQuery } from '@tanstack/react-query';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import CampusShell from './CampusShell';
import { getCampusMe, getCampusNavigation } from './services/campus.service';
import useAuthStore from '../store/auth.store';
import CampusLanding from './pages/CampusLanding';
import ParentCampusHome from './pages/ParentCampusHome';
import StudentCampusHome from './pages/StudentCampusHome';
import TeacherCampusHome from './pages/TeacherCampusHome';
import CoordinationCampusHome from './pages/CoordinationCampusHome';
import StudyCampusHome from './pages/StudyCampusHome';
import SchoolRouteCampusHome from './pages/SchoolRouteCampusHome';
import CampusUnavailable from './pages/CampusUnavailable';
import { mockCampusContext, mockCampusNavigation } from './mockCampusContext';
import './campus.css';

const campusPreviewEnabled = String(import.meta.env.VITE_CAMPUS_PREVIEW || '').trim() === 'true';
const schoolRoutePortalRoles = ['school_route', 'admin', 'rectoria', 'direccion'];

function buildSchoolRouteFallbackContext(user, campusContext = {}) {
  const memberships = [...(campusContext.memberships || [])];
  if (!memberships.some((membership) => membership.memberType === 'campus_school_route')) {
    memberships.push({
      memberType: 'campus_school_route',
      status: 'active',
      title: 'Ruta escolar',
      launchPath: '/campus/route',
      permissions: [],
      virtual: true,
    });
  }

  const navigation = [...(campusContext.navigation || [])];
  if (!navigation.some((item) => item.memberType === 'campus_school_route' || item.path === '/campus/route')) {
    navigation.push({
      memberType: 'campus_school_route',
      path: '/campus/route',
      title: 'Ruta escolar',
      description: 'Portal operativo para conductores y comunicaciones de recogida.',
      virtual: true,
    });
  }

  return {
    ...campusContext,
    enabled: true,
    reason: '',
    memberships,
    navigation,
    defaultPath: '/campus/route',
    user: {
      ...(campusContext.user || {}),
      userId: user?.id || campusContext.user?.userId || '',
      schoolId: user?.schoolId || campusContext.user?.schoolId || '',
      role: 'school_route',
      name: user?.name || campusContext.user?.name || '',
      username: user?.username || campusContext.user?.username || '',
    },
  };
}

function CampusApp({ forcePreview = false }) {
  const { user } = useAuthStore();
  const location = useLocation();
  const normalizedPathname = location.pathname !== '/' ? location.pathname.replace(/\/+$/, '') : '/';
  const isSchoolRouteUser = user?.role === 'school_route';
  const canOpenSchoolRoutePortal = schoolRoutePortalRoles.includes(user?.role) && normalizedPathname === '/campus/route';
  const previewEnabled = campusPreviewEnabled || forcePreview;
  const routeBase = campusPreviewEnabled ? '/campus-preview' : '/campus';
  const campusMeQuery = useQuery({
    queryKey: ['campus', 'me'],
    queryFn: getCampusMe,
    retry: false,
    staleTime: 60_000,
    enabled: !previewEnabled,
  });

  const navigationQuery = useQuery({
    queryKey: ['campus', 'navigation'],
    queryFn: getCampusNavigation,
    retry: false,
    staleTime: 60_000,
    enabled: !previewEnabled,
  });

  if (!previewEnabled && (campusMeQuery.isLoading || navigationQuery.isLoading)) {
    return (
      <div className="campus-loading-screen">
        <div className="campus-loading-card">
          <span className="campus-panel__kicker">Comergio Campus</span>
          <h1>Cargando espacio academico</h1>
          <p>Validando feature flags, membresias y navegacion del piloto.</p>
        </div>
      </div>
    );
  }

  if (previewEnabled) {
    const memberTypes = new Set(mockCampusContext.memberships.map((membership) => membership.memberType));
    const previewNavigation = mockCampusNavigation.navigation.map((item) => ({
      ...item,
      path: item.path.replace('/campus', routeBase),
    }));
    const previewContext = {
      ...mockCampusContext,
      defaultPath: mockCampusContext.defaultPath.replace('/campus', routeBase),
    };

    return (
      <Routes>
        <Route element={<CampusShell campusContext={previewContext} navigation={previewNavigation} routeBase={routeBase} />}>
          <Route element={<CampusLanding campusContext={previewContext} navigation={previewNavigation} />} index />
          <Route
            element={memberTypes.has('campus_parent') ? <ParentCampusHome /> : <Navigate replace to={routeBase} />}
            path="parent"
          />
          <Route
            element={memberTypes.has('campus_student') ? <StudentCampusHome /> : <Navigate replace to={routeBase} />}
            path="student"
          />
          <Route
            element={memberTypes.has('campus_teacher') ? <TeacherCampusHome /> : <Navigate replace to={routeBase} />}
            path="teacher"
          />
          <Route
            element={memberTypes.has('campus_coordination') ? <CoordinationCampusHome /> : <Navigate replace to={routeBase} />}
            path="coordination"
          />
          <Route
            element={memberTypes.has('campus_school_route') ? <SchoolRouteCampusHome /> : <Navigate replace to={routeBase} />}
            path="route"
          />
          <Route element={<StudyCampusHome />} path="study" />
          <Route element={<Navigate replace to={previewContext.defaultPath} />} path="*" />
        </Route>
      </Routes>
    );
  }

  if (campusMeQuery.isError && !canOpenSchoolRoutePortal) {
    return <CampusUnavailable errorMessage={campusMeQuery.error?.message || 'No fue posible cargar Campus.'} />;
  }

  const rawCampusContext = campusMeQuery.data || {};
  const campusContext = canOpenSchoolRoutePortal && !rawCampusContext.enabled
    ? buildSchoolRouteFallbackContext(user, rawCampusContext)
    : rawCampusContext;
  const navigation = canOpenSchoolRoutePortal
    ? campusContext.navigation || []
    : navigationQuery.data?.navigation || campusContext.navigation || [];
  const memberTypes = new Set((campusContext.memberships || []).map((membership) => membership.memberType));
  const defaultPath = campusContext.defaultPath || navigation[0]?.path || '/campus';

  if (!campusContext.enabled) {
    return <CampusUnavailable campusContext={campusContext} />;
  }

  return (
    <Routes>
      <Route element={<CampusShell campusContext={campusContext} navigation={navigation} routeBase={routeBase} />}>
        <Route element={<CampusLanding campusContext={campusContext} navigation={navigation} />} index />
        <Route
          element={memberTypes.has('campus_parent') ? <ParentCampusHome /> : <Navigate replace to="/campus" />}
          path="parent"
        />
        <Route
          element={memberTypes.has('campus_student') ? <StudentCampusHome /> : <Navigate replace to="/campus" />}
          path="student"
        />
        <Route
          element={memberTypes.has('campus_teacher') ? <TeacherCampusHome /> : <Navigate replace to="/campus" />}
          path="teacher"
        />
        <Route
          element={memberTypes.has('campus_coordination') ? <CoordinationCampusHome /> : <Navigate replace to="/campus" />}
          path="coordination"
        />
        <Route
          element={memberTypes.has('campus_school_route') ? <SchoolRouteCampusHome /> : <Navigate replace to="/campus" />}
          path="route"
        />
        <Route element={<StudyCampusHome />} path="study" />
        <Route element={<Navigate replace to={defaultPath} />} path="*" />
      </Route>
    </Routes>
  );
}

export default CampusApp;