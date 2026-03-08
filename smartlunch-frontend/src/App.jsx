import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import AppFooter from './components/AppFooter';
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

function App() {
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin');
  const showNavbar =
    location.pathname !== '/login' &&
    location.pathname !== '/register' &&
    location.pathname !== '/register/next-step' &&
    !location.pathname.startsWith('/parent') &&
    !['/privacy', '/contact'].includes(location.pathname);

  return (
    <div>
      {showNavbar ? <Navbar /> : null}
      <main className={`container ${isAdminRoute ? 'container-full' : ''}`}>
        <Routes>
          <Route element={<Navigate replace to="/login" />} path="/" />
          <Route element={<Login />} path="/login" />
          <Route element={<Register />} path="/register" />
          <Route element={<RegisterVerifiedNext />} path="/register/next-step" />
          <Route element={<POS />} path="/pos" />
          <Route element={<DailyClosure />} path="/daily-closure" />
          <Route element={<Topups />} path="/topups" />
          <Route element={<InventoryRequestPage mode="in" />} path="/inventory/in" />
          <Route element={<InventoryRequestPage mode="out" />} path="/inventory/out" />
          <Route element={<InventoryRequestPage mode="transfer" />} path="/inventory/transfer" />
          <Route element={<CancelSale />} path="/orders/cancel" />
          <Route element={<Wallet />} path="/wallet" />
          <Route element={<Orders />} path="/orders" />
          <Route element={<AdminDashboard />} path="/admin" />
          <Route element={<MeriendasOperator />} path="/meriendas/operator" />
          <Route element={<ParentPortal />} path="/parent/*" />
          <Route element={<Privacy />} path="/privacy" />
          <Route element={<Contact />} path="/contact" />
          <Route element={<Navigate replace to="/login" />} path="*" />
        </Routes>
      </main>
      <AppFooter />
    </div>
  );
}

export default App;
