import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cancelPreorder, fulfillPreorder, getPreordenesOrders, subscribePreordenesOrders } from '../services/orders.service';
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

function formatCurrency(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function waitMinutes(createdAt) {
  const started = new Date(createdAt).getTime();
  if (!Number.isFinite(started)) {
    return 0;
  }
  return Math.max(0, Math.floor((Date.now() - started) / 60000));
}

function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function orderMatchesStudentQuery(order, queryText) {
  if (!queryText) {
    return true;
  }

  const haystack = normalizeSearchText([
    formatOrderCustomerName(order),
    order?.studentId?.schoolCode,
    order?.studentId?.grade,
    order?.studentId?.course,
    formatOrderTicketNumber(order?._id),
    String(order?._id || '').slice(-8),
  ].filter(Boolean).join(' '));

  return haystack.includes(queryText);
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

function Preordenes() {
  const { currentStore, setCurrentStore, user } = useAuthStore();
  const [pending, setPending] = useState([]);
  const [fulfilledToday, setFulfilledToday] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [actingId, setActingId] = useState('');
  const [nowTick, setNowTick] = useState(Date.now());
  const [live, setLive] = useState(false);
  const [newTicketIds, setNewTicketIds] = useState(() => new Set());
  const [expandedDoneIds, setExpandedDoneIds] = useState(() => new Set());
  const [studentQuery, setStudentQuery] = useState('');
  const currentStoreRef = useRef(currentStore);
  const pendingIdsRef = useRef(new Set());
  const highlightTimersRef = useRef(new Map());
  currentStoreRef.current = currentStore;

  const assignedStoreId = String(user?.assignedStore?._id || user?.assignedStoreId?._id || user?.assignedStoreId || '');

  const ensureStoreId = useCallback(async () => {
    if (user?.role === 'vendor' && assignedStoreId) {
      if (String(currentStoreRef.current?._id || '') !== assignedStoreId && user?.assignedStore?._id) {
        setCurrentStore(user.assignedStore);
        currentStoreRef.current = user.assignedStore;
      }
      return assignedStoreId;
    }

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
  }, [assignedStoreId, setCurrentStore, user?.assignedStore, user?.role]);

  const applySnapshot = useCallback((payload = {}) => {
    const expectedStoreId = String(user?.assignedStore?._id || user?.assignedStoreId?._id || user?.assignedStoreId || currentStoreRef.current?._id || '');
    const payloadStoreId = String(payload.store?._id || '');
    if (expectedStoreId && payloadStoreId && payloadStoreId !== expectedStoreId) {
      return;
    }
    const nextPending = sortPendingTickets(Array.isArray(payload.pending) ? payload.pending : [])
      .filter((order) => {
        if (!expectedStoreId) {
          return true;
        }
        const orderStoreId = String(order.storeId?._id || order.storeId || payload.store?._id || '');
        return !orderStoreId || orderStoreId === expectedStoreId;
      });
    const previousIds = pendingIdsRef.current;
    const nextIds = new Set(nextPending.map((order) => String(order._id)));
    const arrived = nextPending
      .map((order) => String(order._id))
      .filter((id) => previousIds.size > 0 && !previousIds.has(id));

    pendingIdsRef.current = nextIds;
    setPending(nextPending);
    setFulfilledToday(
      (Array.isArray(payload.fulfilledToday) ? payload.fulfilledToday : []).filter((order) => {
        if (!expectedStoreId) {
          return true;
        }
        const orderStoreId = String(order.storeId?._id || order.storeId || payload.store?._id || '');
        return !orderStoreId || orderStoreId === expectedStoreId;
      })
    );
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
  }, [user?.assignedStore?._id, user?.assignedStoreId]);

  const loadTickets = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setLoading(true);
      }

      const storeId = await ensureStoreId();
      if (!storeId) {
        setPending([]);
        setFulfilledToday([]);
        setMessage('No hay una tienda activa para esta sesión');
        return;
      }

      const response = await getPreordenesOrders({ storeId });
      applySnapshot(response.data || {});
    } catch (error) {
      setMessage(error?.response?.data?.message || 'No se pudieron cargar las preórdenes');
      setLoading(false);
    }
  }, [applySnapshot, ensureStoreId]);

  useEffect(() => {
    const count = pending.length;
    const previous = document.title;
    document.title = count > 0 ? `Preórdenes (${count})` : 'Preórdenes';
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

        await subscribePreordenesOrders({
          storeId,
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

  const actOnOrder = async (orderId, action) => {
    if (!orderId || actingId) {
      return;
    }

    setActingId(String(orderId));
    try {
      setPending((current) => current.filter((order) => String(order._id) !== String(orderId)));
      if (action === 'fulfill') {
        await fulfillPreorder(orderId);
      } else {
        await cancelPreorder(orderId);
      }
    } catch (error) {
      setMessage(error?.response?.data?.message || (action === 'fulfill' ? 'No se pudo cobrar la preorden' : 'No se pudo cancelar la preorden'));
      await loadTickets({ silent: true });
    } finally {
      setActingId('');
    }
  };

  const queryText = normalizeSearchText(studentQuery);
  const visiblePending = useMemo(
    () => pending.filter((order) => orderMatchesStudentQuery(order, queryText)),
    [pending, queryText]
  );
  const visibleFulfilled = useMemo(
    () => fulfilledToday.filter((order) => orderMatchesStudentQuery(order, queryText)),
    [fulfilledToday, queryText]
  );

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
            <h2>Preórdenes</h2>
            <p>
              {currentStore?.name || 'Tienda'} · {pending.length} pendiente{pending.length === 1 ? '' : 's'} · se cobra al entregar
            </p>
          </div>
          <span className={live ? 'comandera-live is-on' : 'comandera-live'}>
            <i aria-hidden="true" />
            {live ? 'En vivo' : 'Actualizando'}
          </span>
        </div>
        <p className="comandera-banner">
          El alumno se acerca y dice que tiene una preorden. Revisa el pedido, entrégalo y pulsa Entregado / Cobrar.
        </p>
        <div className="comandera-search">
          <input
            aria-label="Buscar niño"
            autoComplete="off"
            autoCorrect="off"
            onChange={(event) => setStudentQuery(event.target.value)}
            placeholder="Buscar niño por nombre, código o grado"
            spellCheck={false}
            type="search"
            value={studentQuery}
          />
          {studentQuery ? (
            <button
              className="comandera-search-clear"
              onClick={() => setStudentQuery('')}
              type="button"
            >
              Limpiar
            </button>
          ) : null}
        </div>
        <DismissibleNotice text={message} type="info" onClose={() => setMessage('')} />
      </section>

      <section className="comandera-queue">
        {loading && pending.length === 0 ? <p>Cargando preórdenes...</p> : null}
        {!loading && pending.length === 0 ? <p className="comandera-empty">No hay preórdenes pendientes en esta tienda.</p> : null}
        {!loading && pending.length > 0 && visiblePending.length === 0 ? (
          <p className="comandera-empty">Ningún niño coincide con «{studentQuery.trim()}».</p>
        ) : null}

        {visiblePending.map((order) => {
          const minutes = waitMinutes(order.createdAt);
          const customerName = formatOrderCustomerName(order);
          const ticketId = String(order._id);
          const gradeLabel = String(order.studentId?.grade || order.studentId?.course || '').trim();
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
                <small>Sin cobrar</small>
              </h3>
              <p className="comandera-meta">
                {[order.studentId?.schoolCode, gradeLabel].filter(Boolean).join(' · ') || 'Alumno'}
              </p>
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
                  {formatCurrency(order.total)} · {minutes === 0 ? 'Recién pedida' : `${minutes} min`}
                </span>
                <div className="comandera-ticket-actions">
                  <button
                    className="btn btn-outline"
                    disabled={actingId === ticketId}
                    onClick={() => actOnOrder(order._id, 'cancel')}
                    type="button"
                  >
                    Cancelar
                  </button>
                  <button
                    className="btn btn-primary comandera-dispatch-btn"
                    disabled={actingId === ticketId}
                    onClick={() => actOnOrder(order._id, 'fulfill')}
                    type="button"
                  >
                    {actingId === ticketId ? 'Cobrando...' : 'Entregado / Cobrar'}
                  </button>
                </div>
              </footer>
            </article>
          );
        })}
      </section>

      {visibleFulfilled.length > 0 ? (
        <section className="panel comandera-done-panel">
          <h3>Entregadas hoy{queryText ? ` · ${visibleFulfilled.length}` : ''}</h3>
          <ul className="comandera-done-list">
            {visibleFulfilled.map((order) => {
              const doneId = String(order._id);
              const isOpen = expandedDoneIds.has(doneId);
              return (
                <li key={`done-${doneId}`}>
                  <div className="comandera-done-row">
                    <span>{formatOrderTicketNumber(order._id)}</span>
                    <strong>{formatOrderCustomerName(order)}</strong>
                    <button
                      aria-expanded={isOpen}
                      className="comandera-more-info"
                      onClick={() => toggleDoneInfo(order._id)}
                      type="button"
                    >
                      {isOpen ? 'ocultar' : 'más info'}
                    </button>
                    <span>{formatTicketTime(order.fulfilledAt || order.createdAt)}</span>
                  </div>
                  {isOpen ? (
                    <ul className="comandera-done-items">
                      {(order.items || []).length === 0 ? (
                        <li>Sin productos en esta preorden.</li>
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

export default Preordenes;
