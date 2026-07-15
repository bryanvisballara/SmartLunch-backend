import { useCallback, useEffect, useRef, useState } from 'react';
import {
  dismissNotification,
  getNotifications,
  markAllNotificationsRead,
} from '../../services/notifications.service';
import { setAppBadgeCount } from '../../lib/appBadge';
import { resolveNotificationPath } from '../../lib/parentNotificationNavigation';
import './ParentNotificationCenter.css';

function formatNotificationTime(value) {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('es-CO', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch (error) {
    return '';
  }
}

function NotificationBellIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 22a2.2 2.2 0 0 0 2.2-2.2h-4.4A2.2 2.2 0 0 0 12 22Z"
        fill="currentColor"
      />
      <path
        d="M18.4 16.2V11a6.4 6.4 0 1 0-12.8 0v5.2L4 18.8V20h16v-1.2l-1.6-2.6Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NotificationListItem({
  item,
  onDismiss,
  onOpen,
}) {
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const currentOffsetRef = useRef(0);

  const reset = () => {
    setOffsetX(0);
    currentOffsetRef.current = 0;
  };

  const beginDrag = (clientX) => {
    startXRef.current = clientX;
    setIsDragging(true);
  };

  const moveDrag = (clientX) => {
    if (!isDragging) return;
    const delta = clientX - startXRef.current;
    const next = Math.min(0, Math.max(-96, delta + (currentOffsetRef.current < -40 ? -72 : 0)));
    setOffsetX(next);
  };

  const endDrag = () => {
    setIsDragging(false);
    if (offsetX <= -48) {
      setOffsetX(-84);
      currentOffsetRef.current = -84;
      return;
    }
    reset();
  };

  return (
    <article className={`parent-notification-item${item.readAt ? '' : ' is-unread'}`}>
      <div className="parent-notification-item__actions" aria-hidden={offsetX > -40}>
        <button
          className="parent-notification-item__delete"
          onClick={() => onDismiss(item)}
          type="button"
        >
          Eliminar
        </button>
      </div>
      <button
        className="parent-notification-item__content"
        onClick={() => {
          if (offsetX < -40) {
            reset();
            return;
          }
          onOpen(item);
        }}
        onPointerCancel={endDrag}
        onPointerDown={(event) => {
          if (event.pointerType === 'mouse' && event.button !== 0) return;
          beginDrag(event.clientX);
        }}
        onPointerMove={(event) => moveDrag(event.clientX)}
        onPointerUp={endDrag}
        style={{ transform: `translateX(${offsetX}px)` }}
        type="button"
      >
        <strong>{item.title || 'Notificación'}</strong>
        <span>{item.body || ''}</span>
        <small>{formatNotificationTime(item.createdAt)}</small>
      </button>
    </article>
  );
}

export default function ParentNotificationCenter({
  enabled = true,
  navigationHandler = null,
  preferStudent = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef(null);

  const syncBadge = useCallback(async (count) => {
    setUnreadCount(count);
    await setAppBadgeCount(count);
  }, []);

  const refreshNotifications = useCallback(async ({ markRead = false } = {}) => {
    if (!enabled) return;
    setLoading(true);
    try {
      const payload = await getNotifications();
      setItems(Array.isArray(payload.items) ? payload.items : []);
      let nextUnread = Number(payload.unreadCount || 0);
      if (markRead && nextUnread > 0) {
        await markAllNotificationsRead();
        nextUnread = 0;
        setItems((current) => current.map((item) => (
          item.readAt ? item : { ...item, readAt: new Date().toISOString() }
        )));
      }
      await syncBadge(nextUnread);
    } catch (error) {
      console.warn('[PARENT_NOTIFICATIONS_LOAD_FAILED]', error);
    } finally {
      setLoading(false);
    }
  }, [enabled, syncBadge]);

  useEffect(() => {
    if (!enabled) return undefined;
    refreshNotifications();
    const intervalId = window.setInterval(() => {
      refreshNotifications();
    }, 60000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshNotifications();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, refreshNotifications]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onPointerDown = (event) => {
      if (!panelRef.current) return;
      if (panelRef.current.contains(event.target)) return;
      setIsOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [isOpen]);

  const openPanel = async () => {
    setIsOpen(true);
    await refreshNotifications({ markRead: true });
  };

  const handleDismiss = async (item) => {
    const id = String(item.id || item._id || '');
    if (!id) return;
    setItems((current) => current.filter((entry) => String(entry.id || entry._id) !== id));
    try {
      const result = await dismissNotification(id);
      await syncBadge(Number(result?.unreadCount || 0));
    } catch (error) {
      console.warn('[PARENT_NOTIFICATION_DISMISS_FAILED]', error);
      refreshNotifications();
    }
  };

  const handleOpen = (item) => {
    const path = resolveNotificationPath(item.payload || item, { preferStudent });
    setIsOpen(false);
    if (typeof navigationHandler === 'function' && path) {
      navigationHandler(path, item);
      return;
    }
    if (path && typeof window !== 'undefined') {
      window.location.assign(path);
    }
  };

  if (!enabled) {
    return null;
  }

  return (
    <div className="parent-notification-center" ref={panelRef}>
      <button
        aria-expanded={isOpen}
        aria-label={`Notificaciones${unreadCount > 0 ? `, ${unreadCount} sin leer` : ''}`}
        className="parent-notification-bell"
        onClick={() => {
          if (isOpen) {
            setIsOpen(false);
            return;
          }
          openPanel();
        }}
        type="button"
      >
        <NotificationBellIcon />
        {unreadCount > 0 ? (
          <span className="parent-notification-bell__badge">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div className="parent-notification-panel" role="dialog" aria-label="Notificaciones">
          <div className="parent-notification-panel__head">
            <strong>Notificaciones</strong>
            <button
              className="parent-notification-panel__close"
              onClick={() => setIsOpen(false)}
              type="button"
            >
              Cerrar
            </button>
          </div>
          {loading && items.length === 0 ? (
            <p className="parent-notification-empty">Cargando...</p>
          ) : null}
          {!loading && items.length === 0 ? (
            <p className="parent-notification-empty">No tienes notificaciones.</p>
          ) : null}
          <div className="parent-notification-list">
            {items.map((item) => (
              <NotificationListItem
                key={String(item.id || item._id)}
                item={item}
                onDismiss={handleDismiss}
                onOpen={handleOpen}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
