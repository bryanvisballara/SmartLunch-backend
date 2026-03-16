import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import AppFooter from './components/AppFooter';
import useAuthStore from './store/auth.store';
import Login from './pages/Login';
import POS from './pages/POS';
import Wallet from './pages/Wallet';
import Orders from './pages/Orders';
import AdminDashboard from './pages/AdminDashboard';
import DailyClosure from './pages/DailyClosure';
import InventoryRequestPage from './pages/InventoryRequestPage';
import CancelSale from './pages/CancelSale';
import Topups from './pages/Topups';
import MeriendasOperator from './pages/MeriendasOperator';
import ParentPortal from './pages/ParentPortal';
import Privacy from './pages/Privacy';
import Contact from './pages/Contact';
import Register from './pages/Register';
import RegisterVerifiedNext from './pages/RegisterVerifiedNext';

function getDefaultRouteByRole(role) {
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

  return '/pos';
}

function RequireAuth({ isAuthenticated, children }) {
  if (!isAuthenticated) {
    return <Navigate replace to="/login" />;
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

function App() {
  const location = useLocation();
  const { token, user } = useAuthStore();
  const userRole = user?.role || '';
  const isAuthenticated = Boolean(token && userRole);
  const isAdminRoute = location.pathname.startsWith('/admin');
  const showNavbar =
    location.pathname !== '/login' &&
    location.pathname !== '/register' &&
    location.pathname !== '/register/next-step' &&
    !location.pathname.startsWith('/parent') &&
    !['/privacy', '/contact'].includes(location.pathname);
  const hideFooter =
    location.pathname === '/login' ||
    location.pathname === '/register' ||
    location.pathname === '/register/next-step';

  return (
    <div>
      {showNavbar ? <Navbar /> : null}
      <main className={`container ${isAdminRoute ? 'container-full' : ''}`}>
        <Routes>
          <Route element={<Navigate replace to="/login" />} path="/" />
          <Route
            element={(
              <PublicOnly isAuthenticated={isAuthenticated} userRole={userRole}>
                <Login />
              </PublicOnly>
            )}
            path="/login"
          />
          <Route element={<Register />} path="/register" />
          <Route element={<RegisterVerifiedNext />} path="/register/next-step" />
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
              <RequireRole allowedRoles={['admin']} isAuthenticated={isAuthenticated} userRole={userRole}>
                <AdminDashboard />
              </RequireRole>
            )}
            path="/admin"
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
              <RequireRole
                allowedRoles={['parent', 'admin']}
                isAuthenticated={isAuthenticated}
                userRole={userRole}
              >
                <ParentPortal />
              </RequireRole>
            )}
            path="/parent/*"
          />
          <Route element={<Privacy />} path="/privacy" />
          <Route element={<Contact />} path="/contact" />
          <Route element={<Navigate replace to="/login" />} path="*" />
        </Routes>
      </main>
      {!hideFooter ? <AppFooter /> : null}
    </div>
  );
}

export default App;
