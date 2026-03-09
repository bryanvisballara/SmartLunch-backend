import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/auth.store';
import smartLogo from '../assets/smartlogo.png';

const menuItems = [
  { key: 'Inicio', label: 'Inicio', icon: 'home' },
  { key: 'Menu - bloquear products', label: 'Menú - bloquear productos', icon: 'food-menu' },
  { key: 'Recargas', label: 'Recargas', icon: 'wallet' },
  { key: 'Historial de órdenes', label: 'Historial de órdenes', icon: 'ticket' },
  { key: 'Limitar consumo', label: 'Limitar consumo', icon: 'limit' },
  { key: 'Meriendas', label: 'Meriendas', icon: 'star' },
];

function renderProfileIcon(icon) {
  if (icon === 'wallet') {
    return (
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 7a3 3 0 0 1 3-3h11a1 1 0 0 1 0 2H6a1 1 0 0 0 0 2h13a2 2 0 0 1 2 2v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7Zm14 5a1.5 1.5 0 1 0 1.5 1.5A1.5 1.5 0 0 0 17 12Z" fill="currentColor"/>
      </svg>
    );
  }
  if (icon === 'home') {
    return (
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="m12 3l9 7h-2v10h-5v-6h-4v6H5V10H3l9-7Z" fill="currentColor"/>
      </svg>
    );
  }
  if (icon === 'food-menu') {
    return (
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 4h2v7a1 1 0 0 0 2 0V4h2v7a3 3 0 0 1-2 2.82V20H6v-6.18A3 3 0 0 1 4 11V4Zm10 0a4 4 0 0 1 4 4v12h-2v-5h-4v5h-2V8a4 4 0 0 1 4-4Zm0 2a2 2 0 0 0-2 2v5h4V8a2 2 0 0 0-2-2Z" fill="currentColor"/>
      </svg>
    );
  }
  if (icon === 'ticket') {
    return (
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4V6Zm7 3v2h2V9h-2Zm0 4v2h2v-2h-2Z" fill="currentColor"/>
      </svg>
    );
  }
  if (icon === 'star') {
    return (
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="m12 2.5l2.9 6l6.6.9l-4.8 4.6l1.1 6.5L12 17.3l-5.8 3.2l1.1-6.5l-4.8-4.6l6.6-.9L12 2.5Z" fill="currentColor"/>
      </svg>
    );
  }
  if (icon === 'limit') {
    return (
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 3a9 9 0 1 0 9 9a9 9 0 0 0-9-9Zm1 4v5.4l3.6 2.2l-1 1.6L11 13.3V7h2Z" fill="currentColor"/>
      </svg>
    );
  }

  return null;
}

function ParentShellHeader({ title, hideSubtitle = false }) {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const firstName = String(user?.name || user?.username || 'Parent').split(' ')[0] || 'Parent';
  const initial = String(user?.name || user?.username || 'P').charAt(0).toUpperCase();

  const onRunMenuAction = (label) => {
    setDrawerOpen(false);

    if (label === 'Inicio') {
      navigate('/parent');
      return;
    }

    if (label === 'Menu - bloquear products') {
      navigate('/parent/menu');
      return;
    }

    if (label === 'Recargas') {
      navigate('/parent/recargas');
      return;
    }

    if (label === 'Historial de órdenes') {
      navigate('/parent/historial-ordenes');
      return;
    }

    if (label === 'Limitar consumo') {
      navigate('/parent/limitar-consumo');
      return;
    }

    if (label === 'Meriendas') {
      navigate('/parent/meriendas');
    }
  };

  const onLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      <header className="parent-topbar">
        <button aria-label="Abrir menu" className="parent-icon-btn" onClick={() => setDrawerOpen(true)} type="button">
          <span />
          <span />
          <span />
        </button>

        <div className="parent-title-wrap">
          <img className="parent-brand-logo" src={smartLogo} alt="SmartLunch" />
          {!hideSubtitle ? <h1>{title || `Hola, ${firstName}!`}</h1> : null}
        </div>

        <div className="parent-profile-wrap">
          <button
            aria-expanded={profileMenuOpen}
            aria-haspopup="menu"
            aria-label="Abrir opciones de perfil"
            className="parent-avatar parent-avatar-btn"
            onClick={() => setProfileMenuOpen((prev) => !prev)}
            type="button"
          >
            {initial}
          </button>

          {profileMenuOpen ? (
            <div className="parent-profile-menu" role="menu">
              <button className="logout" onClick={onLogout} type="button">
                <span className="icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5v-2H5V5h5V3Zm7.6 4.6L16.2 9l2.6 2H9v2h9.8l-2.6 2l1.4 1.4L23 12l-5.4-4.4Z" fill="currentColor"/>
                  </svg>
                </span>
                <span>Cerrar sesión</span>
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {drawerOpen ? (
        <div
          className="parent-drawer-backdrop"
          onClick={() => setDrawerOpen(false)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setDrawerOpen(false);
          }}
          role="button"
          tabIndex={0}
        />
      ) : null}

      {profileMenuOpen ? (
        <div
          className="parent-profile-backdrop"
          onClick={() => setProfileMenuOpen(false)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setProfileMenuOpen(false);
          }}
          role="button"
          tabIndex={0}
        />
      ) : null}

      <aside className={`parent-drawer ${drawerOpen ? 'open' : ''}`}>
        <h3>Hola, {firstName}</h3>
        <p className="parent-drawer-subtitle">¿Qué quieres hacer hoy?</p>
        <nav>
          {menuItems.map((item) => (
            <button key={item.key} onClick={() => onRunMenuAction(item.key)} type="button">
              <span className="icon" aria-hidden="true">{renderProfileIcon(item.icon)}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <button className="parent-logout-btn" onClick={onLogout} type="button">
          <span className="icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5v-2H5V5h5V3Zm7.6 4.6L16.2 9l2.6 2H9v2h9.8l-2.6 2l1.4 1.4L23 12l-5.4-4.4Z" fill="currentColor"/>
            </svg>
          </span>
          <span>Cerrar sesión</span>
        </button>
      </aside>
    </>
  );
}

export default ParentShellHeader;
