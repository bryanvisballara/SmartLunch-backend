import { useEffect, useRef } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import Navbar from './components/Navbar';
import AppFooter from './components/AppFooter';
import useAuthStore from './store/auth.store';
import { resolveComergioAppUrl } from './lib/deepLinks';
import { savePostLoginRedirect } from './lib/postLoginRedirect';
import { ensurePortalPushNotifications, registerPushNotificationNavigation } from './lib/pushNotifications';
import { getDefaultRouteByRole, INSTITUTIONAL_PLACEHOLDER_ROLES } from './lib/defaultRouteByRole';
import Login from './pages/Login';
import LandingPage from './pages/LandingPage';
import POS from './pages/POS';
import Wallet from './pages/Wallet';
import Orders from './pages/Orders';
import AdminDashboard from './pages/AdminDashboard';
import AcademicSecretaryDashboard from './pages/AcademicSecretaryDashboard';
import AdmissionsDashboard from './pages/AdmissionsDashboard';
import RectoriaDashboard from './pages/RectoriaDashboard';
import DailyClosure from './pages/DailyClosure';
import InventoryRequestPage from './pages/InventoryRequestPage';
import CancelSale from './pages/CancelSale';
import Topups from './pages/Topups';
import BoldReturnBridge from './pages/BoldReturnBridge';
import EpaycoReturnBridge from './pages/EpaycoReturnBridge';
import MeriendasOperator from './pages/MeriendasOperator';
import Privacy from './pages/Privacy';
import Contact from './pages/Contact';
import AccountDeletionRequest from './pages/AccountDeletionRequest';
import Register from './pages/Register';
import RegisterVerifiedNext from './pages/RegisterVerifiedNext';
import SchoolCreationWizard from './pages/SchoolCreationWizard';
import AccountDeleted from './pages/AccountDeleted';
import NursingPortal from './pages/NursingPortal';
import PsychologyPortal from './pages/PsychologyPortal';
import HumanResourcesPortal from './pages/HumanResourcesPortal';
import SuperAdminPortal from './pages/SuperAdminPortal';
import CampusApp from './campus/CampusApp';
import ParentCampusHome from './campus/pages/ParentCampusHome';
import TeacherCampusHome from './campus/pages/TeacherCampusHome';
import CampusUnavailable from './campus/pages/CampusUnavailable';

const campusPreviewEnabled = String(import.meta.env.VITE_CAMPUS_PREVIEW || '').trim() === 'true';

function RequireAuth({ isAuthenticated, loginPath = '/login', children }) {
  if (!isAuthenticated) {
    return <Navigate replace to={loginPath} />;
  }

  return children;
}

function RequireRole({ isAuthenticated, userRole, allowedRoles, children }) {
  if (!isAuthenticated) {
    return <Navigate replace to="/login" />;
  }

  if (!allowedRoles.includes(userRole)) {
    return <Navigate replace to={getDefaultRouteByRole(userRole)} />;
  }

  return children;
}

function PublicOnly({ isAuthenticated, userRole, children }) {
  if (isAuthenticated) {
    return <Navigate replace to={getDefaultRouteByRole(userRole)} />;
  }

  return children;
}

function AppHomeEntry({ isAuthenticated, userRole }) {
  if (Capacitor.isNativePlatform()) {
    return <Navigate replace to={isAuthenticated ? getDefaultRouteByRole(userRole) : '/login'} />;
  }

  return <LandingPage />;
}

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { token, user } = useAuthStore();
  const normalizedPathname = location.pathname !== '/'
    ? location.pathname.replace(/\/+$/, '')
    : '/';
  const userRole = user?.role || '';
  const isAuthenticated = Boolean(token && userRole);
  const isLandingRoute = normalizedPathname === '/';
  const isLoginRoute = normalizedPathname === '/login';
  const pushAttemptKeyRef = useRef('');
  const lastHandledAppUrlRef = useRef({ rawUrl: '', internalPath: '', handledAt: 0 });
  const isSuperAdminRoute = normalizedPathname === '/super-admin' || normalizedPathname.startsWith('/super-admin/');
  const isAdminRoute = normalizedPathname.startsWith('/admin') || normalizedPathname.startsWith('/rectoria') || normalizedPathname.startsWith('/direccion') || normalizedPathname.startsWith('/coordinacion');
  const isAdmissionsRoute = normalizedPathname === '/academic-secretary/admissions' || normalizedPathname.startsWith('/academic-secretary/admissions/');
  const isAcademicSecretaryRoute = normalizedPathname === '/academic-secretary' || normalizedPathname.startsWith('/academic-secretary/');
  const isBillingRoute = normalizedPathname === '/cartera' || normalizedPathname.startsWith('/cartera/');
  const isNursingRoute = normalizedPathname === '/enfermeria' || normalizedPathname.startsWith('/enfermeria/');
  const isPsychologyRoute = normalizedPathname === '/psicologia' || normalizedPathname.startsWith('/psicologia/');
  const isHumanResourcesRoute = normalizedPathname === '/recursos-humanos' || normalizedPathname.startsWith('/recursos-humanos/');
  const isFullWidthRoute = isSuperAdminRoute || isAdminRoute || isAcademicSecretaryRoute || isBillingRoute || isNursingRoute || isPsychologyRoute || isHumanResourcesRoute;
  const isCampusRoute = normalizedPathname === '/campus' || normalizedPathname.startsWith('/campus/');
  const isCampusPreviewRoute = normalizedPathname === '/campus-preview' || normalizedPathname.startsWith('/campus-preview/');
  const isParentRoute = normalizedPathname === '/parent' || normalizedPathname.startsWith('/parent/');
  const isSchoolCreationRoute = normalizedPathname === '/schoolcreation';
  const isCampusLikeRoute = isCampusRoute || isCampusPreviewRoute;
  const campusLoginPath = '/login';
  const isEpaycoReturnRoute = normalizedPathname === '/epayco-resultado';
  const isNativeAndroid = Capacitor.getPlatform() === 'android' && Capacitor.isNativePlatform();
  const isAndroidRootRoute = [
    '/parent',
    '/admin',
    '/super-admin',
    '/rectoria',
    '/coordinacion',
    '/direccion',
    '/portal-institucional',
    '/cartera',
    '/enfermeria',
    '/psicologia',
    '/recursos-humanos',
    '/academic-secretary/admissions',
    '/campus',
    '/campus/student',
    '/daily-closure',
    '/meriendas/operator',
    '/pos',
  ].includes(normalizedPathname) || normalizedPathname.startsWith('/campus/student');
  const showNavbar =
    !isLandingRoute &&
    normalizedPathname !== '/login' &&
    normalizedPathname !== '/cuenta-eliminada' &&
    normalizedPathname !== '/register' &&
    normalizedPathname !== '/register/next-step' &&
    !isSchoolCreationRoute &&
    normalizedPathname !== '/bold-resultado' &&
    !isEpaycoReturnRoute &&
    !isAdmissionsRoute &&
    !isSuperAdminRoute &&
    !isCampusLikeRoute &&
    !normalizedPathname.startsWith('/parent') &&
    !['/privacy', '/contact'].includes(normalizedPathname);
  const hideFooter =
    isLandingRoute ||
    normalizedPathname === '/login' ||
    normalizedPathname === '/cuenta-eliminada' ||
    normalizedPathname === '/register' ||
    normalizedPathname === '/register/next-step' ||
    isSchoolCreationRoute ||
    normalizedPathname === '/bold-resultado' ||
    isAdmissionsRoute ||
    isSuperAdminRoute ||
    isCampusLikeRoute ||
    isParentRoute ||
    isEpaycoReturnRoute;

  useEffect(() => {
    document.documentElement.classList.toggle('admissions-route-active', isAdmissionsRoute);
    document.body.classList.toggle('admissions-route-active', isAdmissionsRoute);

    return () => {
      document.documentElement.classList.remove('admissions-route-active');
      document.body.classList.remove('admissions-route-active');
    };
  }, [isAdmissionsRoute]);

  useEffect(() => {
    if (!isAuthenticated || isLoginRoute) {
      return undefined;
    }

    registerPushNotificationNavigation((path) => {
      navigate(path);
    });

    return () => {
      registerPushNotificationNavigation(null);
    };
  }, [isAuthenticated, isLoginRoute, navigate]);

  useEffect(() => {
    if (!isAuthenticated || isLoginRoute) {
      return;
    }

    const attemptKey = `${token}:${userRole}`;
    if (pushAttemptKeyRef.current === attemptKey) {
      return;
    }

    pushAttemptKeyRef.current = attemptKey;

    let cancelled = false;
    let timerId = null;

    const runPushSetup = () => {
      ensurePortalPushNotifications()
        .then((result) => {
          if (cancelled) {
            return;
          }

          if (!result?.enabled) {
            console.warn('[PUSH_SETUP_DISABLED]', result?.reason || 'unknown');
          }
        })
        .catch((error) => {
          if (cancelled) {
            return;
          }

          console.error('[PUSH_SETUP_ERROR]', error?.message || 'unknown');
        });
    };

    if (Capacitor.isNativePlatform() && isNativeAndroid) {
      timerId = window.setTimeout(runPushSetup, 900);
    } else {
      runPushSetup();
    }

    return () => {
      cancelled = true;
      if (timerId) {
        window.clearTimeout(timerId);
      }
    };
  }, [isAuthenticated, isLoginRoute, isNativeAndroid, token, userRole]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return undefined;
    }

    let listenerHandle = null;

    const openInternalPath = (rawUrl) => {
      const internalPath = resolveComergioAppUrl(rawUrl);
      if (!internalPath) {
        return;
      }

      const now = Date.now();
      const lastHandled = lastHandledAppUrlRef.current;
      if (
        lastHandled.internalPath === internalPath
        && now - Number(lastHandled.handledAt || 0) < 8000
      ) {
        return;
      }

      lastHandledAppUrlRef.current = {
        rawUrl: String(rawUrl || '').trim(),
        internalPath,
        handledAt: now,
      };

      savePostLoginRedirect(internalPath);
      navigate(internalPath, { replace: true });
    };

    CapacitorApp.getLaunchUrl()
      .then((result) => {
        if (result?.url) {
          openInternalPath(result.url);
        }
      })
      .catch(() => {});

    CapacitorApp.addListener('appUrlOpen', ({ url }) => {
      openInternalPath(url);
    })
      .then((handle) => {
        listenerHandle = handle;
      })
      .catch(() => {});

    return () => {
      listenerHandle?.remove();
    };
  }, [navigate]);

  useEffect(() => {
    if (!isNativeAndroid) {
      return undefined;
    }

    let listenerHandle = null;

    CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      if (isAndroidRootRoute) {
        if (typeof CapacitorApp.minimizeApp === 'function') {
          CapacitorApp.minimizeApp();
          return;
        }

        CapacitorApp.exitApp();
        return;
      }

      if (canGoBack) {
        window.history.back();
        return;
      }

      if (typeof CapacitorApp.minimizeApp === 'function') {
        CapacitorApp.minimizeApp();
        return;
      }

      CapacitorApp.exitApp();
    })
      .then((handle) => {
        listenerHandle = handle;
      })
      .catch(() => {});

    return () => {
      listenerHandle?.remove();
    };
  }, [isAndroidRootRoute, isNativeAndroid]);

  return (
    <div>
      {showNavbar ? <Navbar /> : null}
      <main className={isLandingRoute ? 'landing-app-main' : isCampusLikeRoute || isParentRoute || isAdmissionsRoute ? 'campus-app-main' : `container ${isFullWidthRoute ? 'container-full' : ''}`}>
        <Routes>
          <Route element={<AppHomeEntry isAuthenticated={isAuthenticated} userRole={userRole} />} path="/" />
          <Route element={<Login />} path="/login" />
          {import.meta.env.DEV ? <Route element={<Login devDirectProfile="laura-medina" postLoginPath="/campus/teacher" />} path="/login/laura-medina" /> : null}
          {import.meta.env.DEV ? <Route element={<Login devDirectProfile="rectoria" postLoginPath="/rectoria" />} path="/login/rectoria" /> : null}
          {import.meta.env.DEV ? <Route element={<Login devDirectProfile="coordinacion-preescolar" postLoginPath="/coordinacion" />} path="/login/coordinacion-preescolar" /> : null}
          <Route
            element={(
              <RequireRole allowedRoles={['teacher', 'admin', 'rectoria', 'direccion']} isAuthenticated={isAuthenticated} userRole={userRole}>
                <TeacherCampusHome />
              </RequireRole>
            )}
            path="/campus/teacher"
          />
          <Route element={<AccountDeleted />} path="/cuenta-eliminada" />
          <Route element={<Register />} path="/register" />
          <Route element={<RegisterVerifiedNext />} path="/register/next-step" />
          <Route element={<SchoolCreationWizard />} path="/schoolcreation" />
          <Route element={<BoldReturnBridge />} path="/bold-resultado" />
          <Route element={<EpaycoReturnBridge />} path="/epayco-resultado" />
          <Route
            element={(
              <RequireRole
                allowedRoles={['admin', 'vendor']}
                isAuthenticated={isAuthenticated}
                userRole={userRole}
              >
                <POS />
              </RequireRole>
            )}
            path="/pos"
          />
          <Route
            element={(
              <RequireRole
                allowedRoles={['admin', 'vendor']}
                isAuthenticated={isAuthenticated}
                userRole={userRole}
              >
                <DailyClosure />
              </RequireRole>
            )}
            path="/daily-closure"
          />
          <Route
            element={(
              <RequireRole
                allowedRoles={['admin', 'vendor']}
                isAuthenticated={isAuthenticated}
                userRole={userRole}
              >
                <Topups />
              </RequireRole>
            )}
            path="/topups"
          />
          <Route
            element={(
              <RequireRole
                allowedRoles={['admin', 'vendor']}
                isAuthenticated={isAuthenticated}
                userRole={userRole}
              >
                <InventoryRequestPage mode="in" />
              </RequireRole>
            )}
            path="/inventory/in"
          />
          <Route
            element={(
              <RequireRole
                allowedRoles={['admin', 'vendor']}
                isAuthenticated={isAuthenticated}
                userRole={userRole}
              >
                <InventoryRequestPage mode="out" />
              </RequireRole>
            )}
            path="/inventory/out"
          />
          <Route
            element={(
              <RequireRole
                allowedRoles={['admin', 'vendor']}
                isAuthenticated={isAuthenticated}
                userRole={userRole}
              >
                <InventoryRequestPage mode="transfer" />
              </RequireRole>
            )}
            path="/inventory/transfer"
          />
          <Route
            element={(
              <RequireRole
                allowedRoles={['admin', 'vendor']}
                isAuthenticated={isAuthenticated}
                userRole={userRole}
              >
                <CancelSale />
              </RequireRole>
            )}
            path="/orders/cancel"
          />
          <Route
            element={(
              <RequireAuth isAuthenticated={isAuthenticated}>
                <Wallet />
              </RequireAuth>
            )}
            path="/wallet"
          />
          <Route
            element={(
              <RequireAuth isAuthenticated={isAuthenticated}>
                <Orders />
              </RequireAuth>
            )}
            path="/orders"
          />
          <Route
            element={(
              <RequireRole allowedRoles={['super_admin']} isAuthenticated={isAuthenticated} userRole={userRole}>
                <SuperAdminPortal />
              </RequireRole>
            )}
            path="/super-admin"
          />
          <Route
            element={(
              <RequireRole allowedRoles={['admin', 'rectoria']} isAuthenticated={isAuthenticated} userRole={userRole}>
                <AdminDashboard />
              </RequireRole>
            )}
            path="/admin"
          />
          <Route
            element={(
              <RequireRole allowedRoles={['rectoria', 'admin']} isAuthenticated={isAuthenticated} userRole={userRole}>
                <RectoriaDashboard />
              </RequireRole>
            )}
            path="/rectoria"
          />
          <Route
            element={(
              <RequireRole allowedRoles={['coordination', 'rectoria', 'admin']} isAuthenticated={isAuthenticated} userRole={userRole}>
                <RectoriaDashboard />
              </RequireRole>
            )}
            path="/coordinacion"
          />
          <Route
            element={(
              <RequireRole allowedRoles={['direccion', 'rectoria', 'admin']} isAuthenticated={isAuthenticated} userRole={userRole}>
                <RectoriaDashboard />
              </RequireRole>
            )}
            path="/direccion"
          />
          <Route
            element={(
              <RequireRole allowedRoles={['academic_secretary', 'admin', 'rectoria']} isAuthenticated={isAuthenticated} userRole={userRole}>
                <AcademicSecretaryDashboard />
              </RequireRole>
            )}
            path="/academic-secretary"
          />
          <Route
            element={(
              <RequireRole allowedRoles={['academic_secretary', 'admissions', 'admin', 'rectoria', 'direccion']} isAuthenticated={isAuthenticated} userRole={userRole}>
                <AdmissionsDashboard />
              </RequireRole>
            )}
            path="/academic-secretary/admissions"
          />
          <Route
            element={(
              <RequireRole allowedRoles={['academic_secretary', 'admissions', 'admin', 'rectoria', 'direccion']} isAuthenticated={isAuthenticated} userRole={userRole}>
                <AdmissionsDashboard />
              </RequireRole>
            )}
            path="/academic-secretary/admissions/stage/:stageKey"
          />
          <Route
            element={(
              <RequireRole allowedRoles={['billing', 'admin', 'rectoria']} isAuthenticated={isAuthenticated} userRole={userRole}>
                <AcademicSecretaryDashboard portalMode="billing" />
              </RequireRole>
            )}
            path="/cartera"
          />
          <Route
            element={(
              <RequireRole allowedRoles={['nursing', 'admin', 'rectoria', 'direccion']} isAuthenticated={isAuthenticated} userRole={userRole}>
                <NursingPortal />
              </RequireRole>
            )}
            path="/enfermeria"
          />
          <Route
            element={(
              <RequireRole allowedRoles={['psychology', 'admin', 'rectoria', 'direccion']} isAuthenticated={isAuthenticated} userRole={userRole}>
                <PsychologyPortal />
              </RequireRole>
            )}
            path="/psicologia"
          />
          <Route
            element={(
              <RequireRole allowedRoles={['human_resources', 'teacher', 'admin', 'rectoria', 'direccion']} isAuthenticated={isAuthenticated} userRole={userRole}>
                <HumanResourcesPortal />
              </RequireRole>
            )}
            path="/recursos-humanos"
          />
          <Route
            element={(
              <RequireRole
                allowedRoles={INSTITUTIONAL_PLACEHOLDER_ROLES}
                isAuthenticated={isAuthenticated}
                userRole={userRole}
              >
                <CampusUnavailable
                  campusContext={{ reason: 'feature_not_enabled' }}
                  errorMessage="Este portal institucional se esta construyendo desde rectoria. Por ahora el usuario ya puede ser creado y administrado."
                />
              </RequireRole>
            )}
            path="/portal-institucional"
          />
          <Route
            element={(
              <RequireRole
                allowedRoles={['merienda_operator', 'admin']}
                isAuthenticated={isAuthenticated}
                userRole={userRole}
              >
                <MeriendasOperator />
              </RequireRole>
            )}
            path="/meriendas/operator"
          />
          <Route
            element={(
              <RequireAuth isAuthenticated={isAuthenticated} loginPath={campusLoginPath}>
                <CampusApp />
              </RequireAuth>
            )}
            path="/campus/*"
          />
          {campusPreviewEnabled ? <Route element={<CampusApp />} path="/campus-preview/*" /> : null}
          <Route
            element={(
              <RequireRole
                allowedRoles={['parent', 'admin']}
                isAuthenticated={isAuthenticated}
                userRole={userRole}
              >
                <ParentCampusHome embedPortal routeBase="/parent" />
              </RequireRole>
            )}
            path="/parent/*"
          />
          <Route element={<Privacy />} path="/privacy" />
          <Route element={<AccountDeletionRequest />} path="/account-deletion" />
          <Route element={<Contact />} path="/contact" />
          <Route element={<Navigate replace to={campusPreviewEnabled ? "/campus-preview/parent" : "/login"} />} path="*" />
        </Routes>
      </main>
      {!hideFooter ? <AppFooter /> : null}
    </div>
  );
}

export default App;
