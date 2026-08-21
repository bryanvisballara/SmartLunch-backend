import { LOGIN_PATH } from '../../lib/authNavigation';
import useAuthStore from '../../store/auth.store';
import { getStaffFeatureLabel } from '../../lib/staffFeatures';
import './StaffPortalDisabled.css';

function StaffPortalDisabled({ featureKey = '' }) {
  const logout = useAuthStore((state) => state.logout);
  const label = getStaffFeatureLabel(featureKey);

  const onLogout = () => {
    logout();
    window.location.assign(LOGIN_PATH);
  };

  return (
    <section className="staff-portal-disabled">
      <div className="staff-portal-disabled__card">
        <p className="staff-portal-disabled__kicker">Módulo inactivo</p>
        <h1>{label} no está activo en este colegio</h1>
        <p>
          Superadministración desactivó este portal para el staff. Si lo necesitas, pídele que lo vuelva a encender en las opciones visibles del colegio.
        </p>
        <button onClick={onLogout} type="button">
          Cerrar sesión
        </button>
      </div>
    </section>
  );
}

export default StaffPortalDisabled;
