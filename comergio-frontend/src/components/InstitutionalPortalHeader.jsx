import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LOGIN_PATH } from '../lib/authNavigation';
import useAuthStore from '../store/auth.store';

function getInitials(value = '') {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'CM';
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || 'CM';
}

export default function InstitutionalPortalHeader({
  portalKicker = 'Portal institucional',
  userName = 'Usuario',
  helperText = '',
  logoSrc = '/campus/comergio-rectoria-colibri.png',
  logoAlt = 'Comergio',
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

  const onLogout = () => {
    setShowMenu(false);
    logout();
    navigate(LOGIN_PATH, { replace: true });
  };

  const onRefreshClick = () => {
    setShowMenu(false);
    onRefresh?.();
  };

  return (
    <header className="institutional-portal-header">
      <div className="institutional-portal-header__side institutional-portal-header__side--left">
        <div aria-hidden="true" className="institutional-portal-header__avatar">
          {getInitials(userName)}
        </div>
        <div className="institutional-portal-header__identity">
          <span className="institutional-portal-header__kicker">{portalKicker}</span>
          <strong>{userName}</strong>
          {helperText ? <span className="institutional-portal-header__helper">{helperText}</span> : null}
        </div>
      </div>

      <div className="institutional-portal-header__brand">
        <img alt={logoAlt} className="institutional-portal-header__brand-image" src={logoSrc} />
      </div>

      <div className="institutional-portal-header__side institutional-portal-header__side--right">
        <div className="institutional-portal-header__menu" ref={menuRef}>
          <button
            aria-expanded={showMenu}
            aria-haspopup="menu"
            aria-label="Abrir menú de usuario"
            className="institutional-portal-header__menu-button"
            onClick={() => setShowMenu((current) => !current)}
            type="button"
          >
            <svg fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 12c2.761 0 5-2.239 5-5s-2.239-5-5-5-5 2.239-5 5 2.239 5 5 5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
              <path d="M4 20.5a8 8 0 0 1 16 0" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
            </svg>
          </button>

          {showMenu ? (
            <div className="institutional-portal-header__dropdown" role="menu">
              {onRefresh ? (
                <button
                  className="institutional-portal-header__dropdown-item"
                  disabled={refreshDisabled}
                  onClick={onRefreshClick}
                  role="menuitem"
                  type="button"
                >
                  <svg fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20 12a8 8 0 1 1-2.34-5.66" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                    <path d="M20 4v6h-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                  </svg>
                  <span>{refreshLabel}</span>
                </button>
              ) : null}
              <button className="institutional-portal-header__dropdown-item" onClick={onLogout} role="menuitem" type="button">
                <svg fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M14 7V5.75A1.75 1.75 0 0 0 12.25 4h-5.5A1.75 1.75 0 0 0 5 5.75v12.5A1.75 1.75 0 0 0 6.75 20h5.5A1.75 1.75 0 0 0 14 18.25V17" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                  <path d="M10 12h9m0 0-2.75-2.75M19 12l-2.75 2.75" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                </svg>
                <span>Cerrar sesión</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
