import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LOGIN_PATH } from '../lib/authNavigation';
import {
  getNotifications,
  getNotificationsUnreadCount,
  markAllNotificationsRead,
} from '../services/notifications.service';
import useAuthStore from '../store/auth.store';
import './staff-chrome/StaffTeacherChrome.css';

function getInitials(value = '') {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'CM';
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || 'CM';
}

function formatNotificationTime(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

export default function InstitutionalPortalHeader({
  portalKicker = 'Portal institucional',
  userName = 'Usuario',
  helperText = '',
  onLogout,
  onRefresh,
  refreshDisabled = false,
  refreshLabel = 'Actualizar portal',
  enableNotifications = false,
  onNotificationNavigate = null,
  showNavToggle = false,
  navOpen = false,
  onToggleNav,
}) {
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const menuRef = useRef(null);
  const notificationsRef = useRef(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUnreadCount = useCallback(async () => {
    if (!enableNotifications) return;
    try {
      const payload = await getNotificationsUnreadCount();
      setUnreadCount(Number(payload?.unreadCount || payload?.count || 0));
    } catch (_error) {
      // Keep last known count on transient failures.
    }
  }, [enableNotifications]);

  useEffect(() => {
    if (!enableNotifications) return undefined;
    refreshUnreadCount();
    const timer = window.setInterval(refreshUnreadCount, 30000);
    return () => window.clearInterval(timer);
  }, [enableNotifications, refreshUnreadCount]);

  useEffect(() => {
    if (!showMenu && !showNotifications) return undefined;

    const onPointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    };

    const onEscape = (event) => {
      if (event.key === 'Escape') {
        setShowMenu(false);
        setShowNotifications(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onEscape);
    };
  }, [showMenu, showNotifications]);

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

  const openNotifications = async () => {
    setShowMenu(false);
    setShowNotifications((current) => !current);
    if (showNotifications) return;

    setNotificationsLoading(true);
    try {
      const payload = await getNotifications();
      const items = (Array.isArray(payload?.items) ? payload.items : []).filter((item) => {
        const type = String(item?.payload?.type || item?.type || '');
        return type !== 'informa.post' && type !== 'conecta.case';
      });
      setNotifications(items);
      await markAllNotificationsRead().catch(() => null);
      setUnreadCount(0);
    } catch (_error) {
      setNotifications([]);
    } finally {
      setNotificationsLoading(false);
    }
  };

  const handleNotificationClick = (item) => {
    setShowNotifications(false);
    const sectionKey = String(item?.payload?.sectionKey || '').trim();
    const type = String(item?.payload?.type || item?.type || '').trim();
    const resolvedSection = sectionKey
      || (type.startsWith('nursing.') ? 'control_nursing' : '')
      || (type.startsWith('psychology.') ? 'control_wellbeing' : '')
      || (type.startsWith('hr.planner.') ? 'resources' : '');

    if (resolvedSection && typeof onNotificationNavigate === 'function') {
      onNotificationNavigate(resolvedSection, item);
      return;
    }

    const url = String(item?.payload?.url || '').trim();
    if (url.startsWith('/')) {
      navigate(url);
    }
  };

  return (
    <header className="staff-teacher-chrome__topbar institutional-portal-header">
      {showNavToggle ? (
        <button
          aria-controls="staff-portal-nav"
          aria-expanded={navOpen}
          aria-label={navOpen ? 'Cerrar menú' : 'Abrir menú'}
          className="staff-portal-shell__nav-toggle"
          onClick={onToggleNav}
          type="button"
        >
          <span />
          <span />
          <span />
        </button>
      ) : null}
      <div className="staff-teacher-chrome__topbar-spacer">
        {helperText ? (
          <div className="institutional-portal-header__helper-inline">
            <strong>{portalKicker}</strong>
            <span>{helperText}</span>
          </div>
        ) : null}
      </div>

      <div className="staff-teacher-chrome__topbar-actions">
        {enableNotifications ? (
          <div className="staff-teacher-chrome__topbar-icon-wrap" ref={notificationsRef}>
            <button
              aria-label="Notificaciones"
              className="staff-teacher-chrome__topbar-icon-btn"
              onClick={openNotifications}
              type="button"
            >
              <svg fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 22a2.2 2.2 0 0 0 2.2-2.2h-4.4A2.2 2.2 0 0 0 12 22Z" fill="currentColor" />
                <path d="M18.4 16.2V11a6.4 6.4 0 1 0-12.8 0v5.2L4 18.8V20h16v-1.2l-1.6-2.6Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
              </svg>
              {unreadCount > 0 ? (
                <span className="staff-teacher-chrome__topbar-badge">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              ) : null}
            </button>

            {showNotifications ? (
              <div className="staff-teacher-chrome__topbar-dropdown staff-teacher-chrome__topbar-dropdown--notifications" role="dialog" aria-label="Notificaciones">
                <header>
                  <strong>Notificaciones</strong>
                  <span>Bienestar, enfermería y planners</span>
                </header>
                <div className="staff-teacher-chrome__topbar-dropdown-list">
                  {notificationsLoading ? <p>Cargando...</p> : null}
                  {!notificationsLoading && notifications.length === 0 ? (
                    <p>No tienes notificaciones nuevas.</p>
                  ) : null}
                  {!notificationsLoading
                    ? notifications.slice(0, 12).map((item) => (
                      <button
                        className="staff-teacher-chrome__topbar-dropdown-item staff-teacher-chrome__topbar-dropdown-item--notification"
                        key={item.id || item._id || `${item.title}-${item.createdAt}`}
                        onClick={() => handleNotificationClick(item)}
                        type="button"
                      >
                        <strong>{item.title || 'Notificación'}</strong>
                        <span>{item.body || item.message || ''}</span>
                        {item.createdAt ? <em>{formatNotificationTime(item.createdAt)}</em> : null}
                      </button>
                    ))
                    : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

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
