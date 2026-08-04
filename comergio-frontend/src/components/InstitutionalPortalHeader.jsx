import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LOGIN_PATH } from '../lib/authNavigation';
import useAuthStore from '../store/auth.store';
import './staff-chrome/StaffTeacherChrome.css';

function getInitials(value = '') {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'CM';
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || 'CM';
}

export default function InstitutionalPortalHeader({
  portalKicker = 'Portal institucional',
  userName = 'Usuario',
  helperText = '',
  onLogout,
  onRefresh,
  refreshDisabled = false,
  refreshLabel = 'Actualizar portal',
}) {
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const menuRef = useRef(null);
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    if (!showMenu) return undefined;

    const onPointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) {
        setShowMenu(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [showMenu]);

  const handleLogout = () => {
    setShowMenu(false);
    if (typeof onLogout === 'function') {
      onLogout();
      return;
    }
    logout();
    navigate(LOGIN_PATH, { replace: true });
  };

  const onRefreshClick = () => {
    setShowMenu(false);
    onRefresh?.();
  };

  return (
    <header className="staff-teacher-chrome__topbar institutional-portal-header">
      <div className="staff-teacher-chrome__topbar-spacer">
        {helperText ? (
          <div className="institutional-portal-header__helper-inline">
            <strong>{portalKicker}</strong>
            <span>{helperText}</span>
          </div>
        ) : null}
      </div>

      <div className="staff-teacher-chrome__topbar-actions">
        <div className="staff-teacher-chrome__topbar-profile" ref={menuRef}>
          <button
            aria-expanded={showMenu}
            aria-haspopup="menu"
            aria-label="Abrir menú de usuario"
            className="staff-teacher-chrome__topbar-profile-btn"
            onClick={() => setShowMenu((current) => !current)}
            type="button"
          >
            <span className="staff-teacher-chrome__topbar-avatar" aria-hidden="true">
              {getInitials(userName)}
            </span>
            <span className="staff-teacher-chrome__topbar-profile-copy">
              <strong>{userName}</strong>
              <span>{portalKicker}</span>
            </span>
            <svg aria-hidden="true" className="staff-teacher-chrome__topbar-chevron" fill="none" viewBox="0 0 24 24">
              <path d="m7 10 5 5 5-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
            </svg>
          </button>

          {showMenu ? (
            <div className="staff-teacher-chrome__topbar-dropdown" role="menu">
              {onRefresh ? (
                <button
                  className="staff-teacher-chrome__topbar-dropdown-item"
                  disabled={refreshDisabled}
                  onClick={onRefreshClick}
                  role="menuitem"
                  type="button"
                >
                  {refreshLabel}
                </button>
              ) : null}
              <button
                className="staff-teacher-chrome__topbar-dropdown-item is-danger"
                onClick={handleLogout}
                role="menuitem"
                type="button"
              >
                Cerrar sesión
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
