import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/auth.store';
import { getStores } from '../services/stores.service';
import { me } from '../services/auth.service';
import { redirectToLoginPage } from '../lib/authNavigation';

const INSTITUTIONAL_PLACEHOLDER_ROLE_LABELS = {
  coordination: 'Coordinación',
  teacher: 'Docentes',
  nursing: 'Enfermería',
  psychology: 'Psicología',
  human_resources: 'Recursos y gestion de compras',
  school_route: 'Ruta escolar',
};

function Navbar() {
  const navigate = useNavigate();
  const { token, user, currentStore, setCurrentStore, setUser, logout } = useAuthStore();

  const onLogout = () => {
    logout();
    redirectToLoginPage();
  };

  useEffect(() => {
    const hydrateUser = async () => {
      if (!token || user?.role) {
        return;
      }

      try {
        const response = await me();
        const profile = response.data;
        setUser({
          id: profile._id,
          schoolId: profile.schoolId,
          name: profile.name,
          username: profile.username,
          role: profile.role,
          assignedStore: profile.assignedStore || null,
        });
      } catch (error) {
        // If token is stale, keep current state and let user log out explicitly.
      }
    };

    hydrateUser();
  }, [token, user?.role, setUser]);

  useEffect(() => {
    const loadStore = async () => {
      if (!token || user?.role !== 'vendor' || currentStore?._id) {
        return;
      }

      if (user?.assignedStore?._id) {
        setCurrentStore(user.assignedStore);
        return;
      }

      try {
        const response = await getStores();
        const firstStore = response.data?.[0] || null;
        if (firstStore) {
          setCurrentStore(firstStore);
        }
      } catch (error) {
        // Ignore store hint failures; header still works with vendor name.
      }
    };

    loadStore();
  }, [token, user?.role, currentStore?._id, setCurrentStore]);

  const isVendor = user?.role === 'vendor';
  const isAdmin = user?.role === 'admin';
  const isRectoria = user?.role === 'rectoria';
  const isDireccion = user?.role === 'direccion';
  const isCoordination = user?.role === 'coordination';
  const isAcademicSecretary = user?.role === 'academic_secretary';
  const isBilling = user?.role === 'billing';
  const isMeriendaOperator = user?.role === 'merienda_operator';
  const isParent = user?.role === 'parent';
  const institutionalPlaceholderLabel = ['nursing', 'psychology', 'human_resources'].includes(user?.role) ? '' : INSTITUTIONAL_PLACEHOLDER_ROLE_LABELS[user?.role] || '';

  return (
    <nav className="nav">
      {!isVendor ? <div className="nav-brand">Comergio</div> : null}
      {isAdmin ? (
        <div className="nav-admin-right">
          <span className="nav-meta">Administrador: {user?.name || user?.username || 'N/A'}</span>
          {token ? (
            <button className="btn btn-outline" onClick={onLogout} type="button">
              Logout
            </button>
          ) : (
            <Link to="/login">Login</Link>
          )}
        </div>
      ) : isRectoria || isDireccion || isCoordination ? (
        <div className="nav-admin-right">
          <Link to={isCoordination ? '/coordinacion' : (isDireccion ? '/direccion' : '/rectoria')}>{isCoordination ? 'Coordinación' : (isDireccion ? 'Dirección' : 'Rectoría')}</Link>
          <span className="nav-meta">{isCoordination ? 'Coordinación' : (isDireccion ? 'Dirección' : 'Rectoría')}: {user?.name || user?.username || 'N/A'}</span>
          {token ? (
            <button className="btn btn-outline" onClick={onLogout} type="button">
              Logout
            </button>
          ) : (
            <Link to="/login">Login</Link>
          )}
        </div>
      ) : isAcademicSecretary || isBilling ? (
        <div className="nav-admin-right">
          <Link to={isBilling ? '/cartera' : '/academic-secretary'}>{isBilling ? 'Cartera' : 'Secretaría académica'}</Link>
          <span className="nav-meta">{isBilling ? 'Cartera' : 'Secretaría'}: {user?.name || user?.username || 'N/A'}</span>
          {token ? (
            <button className="btn btn-outline" onClick={onLogout} type="button">
              Logout
            </button>
          ) : (
            <Link to="/login">Login</Link>
          )}
        </div>
      ) : user?.role === 'nursing' ? (
        <div className="nav-admin-right">
          <Link to="/enfermeria">Enfermería</Link>
          <span className="nav-meta">Enfermería: {user?.name || user?.username || 'N/A'}</span>
          {token ? (
            <button className="btn btn-outline" onClick={onLogout} type="button">
              Logout
            </button>
          ) : (
            <Link to="/login">Login</Link>
          )}
        </div>
      ) : user?.role === 'psychology' ? (
        <div className="nav-admin-right">
          <Link to="/psicologia">Psicología</Link>
          <span className="nav-meta">Psicología: {user?.name || user?.username || 'N/A'}</span>
          {token ? (
            <button className="btn btn-outline" onClick={onLogout} type="button">
              Logout
            </button>
          ) : (
            <Link to="/login">Login</Link>
          )}
        </div>
      ) : user?.role === 'human_resources' ? (
        <div className="nav-admin-right">
          <Link to="/recursos-humanos">Recursos y gestion de compras</Link>
          <span className="nav-meta">RRHH: {user?.name || user?.username || 'N/A'}</span>
          {token ? (
            <button className="btn btn-outline" onClick={onLogout} type="button">
              Logout
            </button>
          ) : (
            <Link to="/login">Login</Link>
          )}
        </div>
      ) : institutionalPlaceholderLabel ? (
        <div className="nav-admin-right">
          <Link to="/portal-institucional">{institutionalPlaceholderLabel}</Link>
          <span className="nav-meta">{institutionalPlaceholderLabel}: {user?.name || user?.username || 'N/A'}</span>
          {token ? (
            <button className="btn btn-outline" onClick={onLogout} type="button">
              Logout
            </button>
          ) : (
            <Link to="/login">Login</Link>
          )}
        </div>
      ) : isMeriendaOperator ? (
        <div className="nav-admin-right">
          <Link to="/meriendas/operator">Portal de meriendas</Link>
          <span className="nav-meta">Tutor de alimentación: {user?.name || user?.username || 'N/A'}</span>
          {token ? (
            <button className="btn btn-outline" onClick={onLogout} type="button">
              Logout
            </button>
          ) : (
            <Link to="/login">Login</Link>
          )}
        </div>
      ) : isVendor ? (
        <div className="nav-vendor-shell">
          <div className="nav-vendor-top">
            <div className="nav-vendor-spacer" aria-hidden="true" />

            <div className="nav-vendor-center">
              <div className="nav-brand nav-vendor-brand">Comergio</div>
              <div className="nav-vendor-meta-row">
                <span className="nav-meta">Tienda: {currentStore?.name || 'Sin tienda'}</span>
                <span className="nav-meta">Vendedor: {user?.name || 'N/A'}</span>
              </div>
            </div>

            <div className="nav-vendor-actions">
              {token ? (
                <button className="btn btn-outline" onClick={onLogout} type="button">
                  Logout
                </button>
              ) : (
                <Link to="/login">Login</Link>
              )}
            </div>
          </div>

          <div className="nav-links nav-vendor-links">
            <Link to="/pos">POS</Link>
            <Link to="/daily-closure">Cierre Diario</Link>
            <Link to="/topups">Recargas</Link>
            <Link to="/inventory/in">Ingresos</Link>
            <Link to="/inventory/out">Egresos</Link>
            <Link to="/inventory/transfer">Traslados</Link>
            <Link to="/orders">Ordenes</Link>
            <Link to="/orders/cancel">Cancelar Venta</Link>
          </div>
        </div>
      ) : (
        <div className="nav-links">
          {isParent ? (
          <>
            <Link to="/parent">Inicio</Link>
            <span className="nav-separator" aria-hidden="true" />
            <Link to="/wallet">Recargas</Link>
            <span className="nav-separator" aria-hidden="true" />
            <Link to="/orders">Historial</Link>
          </>
        ) : (
          <>
            <Link to="/pos">POS</Link>
            <span className="nav-separator" aria-hidden="true" />
            <Link to="/wallet">Wallet</Link>
            <span className="nav-separator" aria-hidden="true" />
            <Link to="/orders">Orders</Link>
            <span className="nav-separator" aria-hidden="true" />
            <Link to="/admin">Admin</Link>
          </>
          )}
          {token ? (
            <button className="btn btn-outline" onClick={onLogout} type="button">
              Logout
            </button>
          ) : (
            <Link to="/login">Login</Link>
          )}
        </div>
      )}
    </nav>
  );
}

export default Navbar;
