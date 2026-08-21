import { useCallback, useEffect, useRef, useState } from 'react';
import { dispatchOrder, getComanderaOrders, subscribeComanderaOrders } from '../services/orders.service';
import { getStores } from '../services/stores.service';
import useAuthStore from '../store/auth.store';
import DismissibleNotice from '../components/DismissibleNotice';
import { formatOrderCustomerName, formatOrderTicketNumber } from '../lib/orderCustomerName';
import './Comandera.css';

function formatTicketTime(value) {
  if (!value) {
    return '';
  }

  return new Date(value).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function waitMinutes(createdAt) {
  const started = new Date(createdAt).getTime();
  if (!Number.isFinite(started)) {
    return 0;
  }
  return Math.max(0, Math.floor((Date.now() - started) / 60000));
}

function sortPendingTickets(orders = []) {
  return [...orders].sort((left, right) => {
    const leftTime = new Date(left?.createdAt || 0).getTime();
    const rightTime = new Date(right?.createdAt || 0).getTime();
    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }
    return String(left?._id || '').localeCompare(String(right?._id || ''));
  });
}

function Comandera() {
  const { currentStore, setCurrentStore, user } = useAuthStore();
  const [pending, setPending] = useState([]);
  const [dispatchedToday, setDispatchedToday] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [dispatchingId, setDispatchingId] = useState('');
  const [comanderaEnabled, setComanderaEnabled] = useState(Boolean(currentStore?.comanderaEnabled));
  const [nowTick, setNowTick] = useState(Date.now());
  const [live, setLive] = useState(false);
  const [newTicketIds, setNewTicketIds] = useState(() => new Set());
  const [expandedDoneIds, setExpandedDoneIds] = useState(() => new Set());
  const currentStoreRef = useRef(currentStore);
  const pendingIdsRef = useRef(new Set());
  const highlightTimersRef = useRef(new Map());
  currentStoreRef.current = currentStore;

  const ensureStoreId = useCallback(async () => {
    const existingId = currentStoreRef.current?._id;
    if (existingId) {
      return existingId;
    }

    const response = await getStores();
    const firstStore = response.data?.[0] || null;
    if (firstStore?._id) {
      setCurrentStore(firstStore);
      currentStoreRef.current = firstStore;
      return firstStore._id;
    }

    return '';
  }, [setCurrentStore]);

  const applySnapshot = useCallback((payload = {}) => {
    const nextPending = sortPendingTickets(Array.isArray(payload.pending) ? payload.pending : []);
    const previousIds = pendingIdsRef.current;
    const nextIds = new Set(nextPending.map((order) => String(order._id)));
    const arrived = nextPending
      .map((order) => String(order._id))
      .filter((id) => previousIds.size > 0 && !previousIds.has(id));

    pendingIdsRef.current = nextIds;
    setPending(nextPending);
    setDispatchedToday(Array.isArray(payload.dispatchedToday) ? payload.dispatchedToday : []);
    setComanderaEnabled(Boolean(payload.store?.comanderaEnabled));
    setLoading(false);
    setMessage('');

    if (arrived.length) {
      setNewTicketIds((current) => {
        const next = new Set(current);
        arrived.forEach((id) => next.add(id));
        return next;
      });
      arrived.forEach((id) => {
        const previousTimer = highlightTimersRef.current.get(id);
        if (previousTimer) {
          window.clearTimeout(previousTimer);
        }
        const timer = window.setTimeout(() => {
          setNewTicketIds((current) => {
            const next = new Set(current);
            next.delete(id);
            return next;
          });
          highlightTimersRef.current.delete(id);
        }, 4000);
        highlightTimersRef.current.set(id, timer);
      });
    }

    const storeSnapshot = currentStoreRef.current;
    if (payload.store?._id && storeSnapshot?._id && String(payload.store._id) === String(storeSnapshot._id)) {
      if (Boolean(storeSnapshot.comanderaEnabled) !== Boolean(payload.store.comanderaEnabled)) {
        const nextStore = { ...storeSnapshot, comanderaEnabled: Boolean(payload.store.comanderaEnabled) };
        currentStoreRef.current = nextStore;
        setCurrentStore(nextStore);
      }
    }
  }, [setCurrentStore]);

  const loadTickets = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setLoading(true);
      }

      const storeId = await ensureStoreId();
      if (!storeId) {
        setPending([]);
        setDispatchedToday([]);
        setMessage('No hay una tienda activa para esta sesión');
        return;
      }

      const params = user?.role === 'admin' ? { storeId } : {};
      const response = await getComanderaOrders(params);
      applySnapshot(response.data || {});
    } catch (error) {
      setMessage(error?.response?.data?.message || 'No se pudieron cargar las comandas');
      setLoading(false);
    }
  }, [applySnapshot, ensureStoreId, user?.role]);

  useEffect(() => {
    const count = pending.length;
    const previous = document.title;
    document.title = count > 0 ? `Comandera (${count})` : 'Comandera';
    return () => {
      document.title = previous;
    };
  }, [pending.length]);

  useEffect(() => {
    const tick = window.setInterval(() => setNowTick(Date.now()), 15000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let reconnectTimer = 0;
    let pollTimer = 0;
    let controller = null;
    let attempt = 0;

    const stopPoll = () => {
      if (pollTimer) {
        window.clearInterval(pollTimer);
        pollTimer = 0;
      }
    };

    const startPoll = () => {
      if (pollTimer || cancelled) {
        return;
      }
      pollTimer = window.setInterval(() => {
        loadTickets({ silent: true });
      }, 1500);
    };

    const connect = async () => {
      if (cancelled) {
        return;
      }

      stopPoll();
      controller?.abort();
      controller = new AbortController();

      try {
        const storeId = await ensureStoreId();
        if (!storeId || cancelled) {
          return;
        }

        await subscribeComanderaOrders({
          storeId: user?.role === 'admin' ? storeId : undefined,
          signal: controller.signal,
          onSnapshot: (payload) => {
            if (cancelled) {
              return;
            }
            attempt = 0;
            setLive(true);
            applySnapshot(payload);
          },
        });
      } catch (error) {
        if (cancelled || error?.name === 'AbortError') {
          return;
        }
        setLive(false);
        startPoll();
      }

      if (cancelled) {
        return;
      }

      setLive(false);
      startPoll();
      const delay = Math.min(8000, 1000 * (2 ** attempt));
      attempt += 1;
      reconnectTimer = window.setTimeout(connect, delay);
    };

    loadTickets();
    connect();

    return () => {
      cancelled = true;
      setLive(false);
      controller?.abort();
      stopPoll();
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      highlightTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      highlightTimersRef.current.clear();
    };
  }, [applySnapshot, ensureStoreId, loadTickets, user?.role, currentStore?._id]);

  const markDispatched = async (orderId) => {
    if (!orderId || dispatchingId) {
      return;
    }

    setDispatchingId(String(orderId));
    try {
      setPending((current) => current.filter((order) => String(order._id) !== String(orderId)));
      await dispatchOrder(orderId);
    } catch (error) {
      setMessage(error?.response?.data?.message || 'No se pudo marcar como despachado');
      await loadTickets({ silent: true });
    } finally {
      setDispatchingId('');
    }
  };

  const toggleDoneInfo = (orderId) => {
    const id = String(orderId || '');
    if (!id) {
      return;
    }

    setExpandedDoneIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="page-grid single comandera-page">
      <section className="panel comandera-header-panel">
        <div className="comandera-header">
          <div>
            <h2>Comandera</h2>
            <p>
              {currentStore?.name || 'Tienda'} · {comanderaEnabled ? 'Activa' : 'Apagada'} · {pending.length} pendiente{pending.length === 1 ? '' : 's'}
            </p>
          </div>
          <span className={live ? 'comandera-live is-on' : 'comandera-live'}>
            <i aria-hidden="true" />
            {live ? 'En vivo' : 'Actualizando'}
          </span>
        </div>
        {!comanderaEnabled ? (
          <p className="comandera-banner">
            La comandera está apagada en el POS. Las ventas nuevas no entran a esta cola; las pendientes sí se pueden despachar.
          </p>
        ) : null}
        <DismissibleNotice text={message} type="info" onClose={() => setMessage('')} />
      </section>

      <section className="comandera-queue">
        {loading && pending.length === 0 ? <p>Cargando comandas...</p> : null}
        {!loading && pending.length === 0 ? <p className="comandera-empty">No hay pedidos por despachar.</p> : null}

        {pending.map((order) => {
          const minutes = waitMinutes(order.createdAt);
          const customerName = formatOrderCustomerName(order);
          const ticketId = String(order._id);
          return (
            <article
              className={`comandera-ticket${newTicketIds.has(ticketId) ? ' is-new' : ''}`}
              key={ticketId}
              data-now={nowTick}
            >
              <header className="comandera-ticket-top">
                <span className="comandera-ticket-number">{formatOrderTicketNumber(order._id)}</span>
                <span className="comandera-ticket-time">{formatTicketTime(order.createdAt)}</span>
              </header>
              <h3 className="comandera-customer">
                {customerName}
                {order.guestSale ? <small>Externa</small> : null}
              </h3>
              {order.studentId?.schoolCode ? (
                <p className="comandera-meta">{order.studentId.schoolCode}</p>
              ) : null}
              <ul className="comandera-items">
                {(order.items || []).map((item, index) => (
                  <li key={`${order._id}-${index}`}>
                    <strong>{item.quantity}x</strong>
                    <span>{item.nameSnapshot || 'Producto'}</span>
                  </li>
                ))}
              </ul>
              <footer className="comandera-ticket-footer">
                <span className={minutes >= 8 ? 'comandera-wait is-late' : 'comandera-wait'}>
                  {minutes === 0 ? 'Recién cobrado' : `${minutes} min`}
                </span>
                <button
                  className="btn btn-primary comandera-dispatch-btn"
                  type="button"
                  disabled={dispatchingId === ticketId}
                  onClick={() => markDispatched(order._id)}
                >
                  {dispatchingId === ticketId ? 'Despachando...' : 'Despachado'}
                </button>
              </footer>
            </article>
          );
        })}
      </section>

      {dispatchedToday.length > 0 ? (
        <section className="panel comandera-done-panel">
          <h3>Despachados hoy</h3>
          <ul className="comandera-done-list">
            {dispatchedToday.map((order) => {
              const doneId = String(order._id);
              const isOpen = expandedDoneIds.has(doneId);
              return (
                <li key={`done-${doneId}`}>
                  <div className="comandera-done-row">
                    <span>{formatOrderTicketNumber(order._id)}</span>
                    <strong>{formatOrderCustomerName(order)}</strong>
                    <button
                      className="comandera-more-info"
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => toggleDoneInfo(order._id)}
                    >
                      {isOpen ? 'ocultar' : 'más info'}
                    </button>
                    <span>{formatTicketTime(order.dispatchedAt || order.createdAt)}</span>
                  </div>
                  {isOpen ? (
                    <ul className="comandera-done-items">
                      {(order.items || []).length === 0 ? (
                        <li>Sin productos en esta comanda.</li>
                      ) : (
                        (order.items || []).map((item, index) => (
                          <li key={`${doneId}-item-${index}`}>
                            {item.quantity}x {item.nameSnapshot || 'Producto'}
                          </li>
                        ))
                      )}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export default Comandera;
