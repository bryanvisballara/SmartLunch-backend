import { useEffect, useMemo, useState } from 'react';
import { getOrderCancellationRequests, getOrders, requestOrderCancellation } from '../services/orders.service';
import { getStudents } from '../services/students.service';
import { getDailyClosures } from '../services/dailyClosure.service';
import DismissibleNotice from '../components/DismissibleNotice';
import useAuthStore from '../store/auth.store';

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function CancelSale() {
  const { user, currentStore } = useAuthStore();
  const [orders, setOrders] = useState([]);
  const [filters, setFilters] = useState({
    from: todayYmd(),
    to: todayYmd(),
    searchType: 'student',
    studentId: '',
    productKey: '',
  });
  const [studentQuery, setStudentQuery] = useState('');
  const [showStudentOptions, setShowStudentOptions] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const [showProductOptions, setShowProductOptions] = useState(false);
  const [students, setStudents] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [historyRequests, setHistoryRequests] = useState([]);
  const [message, setMessage] = useState('');
  const [dayClosed, setDayClosed] = useState(false);
  const [onlyExternalSales, setOnlyExternalSales] = useState(false);
  const [successModal, setSuccessModal] = useState({ open: false, fading: false });
  const [submitting, setSubmitting] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const isVendor = user?.role === 'vendor';

  const normalizeDateForApi = (value, isEndOfDay = false) => {
    if (!value) {
      return null;
    }

    const suffix = isEndOfDay ? 'T23:59:59.999' : 'T00:00:00.000';
    return new Date(`${value}${suffix}`).toISOString();
  };

  const formatDateTime = (value) => (value ? new Date(value).toLocaleString('es-CO') : 'N/A');

  const resetPage = () => {
    setOrders([]);
    setPendingRequests([]);
    setStudentQuery('');
    setShowStudentOptions(false);
    setProductQuery('');
    setShowProductOptions(false);
  };

  const loadDayStatus = async () => {
    try {
      const response = await getDailyClosures({ date: todayYmd() });
      const closed = (response.data || []).length > 0;
      setDayClosed(closed);

      if (closed) {
        resetPage();
        setMessage('Ya cerraste el día. No puedes solicitar anulaciones.');
      }

      return closed;
    } catch (error) {
      setDayClosed(false);
      return false;
    }
  };

  const loadOrders = async (nextFilters = filters) => {
    try {
      setLoadingOrders(true);
      const params = {};
      if (nextFilters.searchType === 'student' && nextFilters.studentId) {
        params.studentId = nextFilters.studentId;
      }
      if (nextFilters.from) {
        params.from = normalizeDateForApi(nextFilters.from);
      }
      if (nextFilters.to) {
        params.to = normalizeDateForApi(nextFilters.to, true);
      }
      const response = await getOrders(params);
      setOrders((response.data || []).filter((order) => order.status === 'completed'));
    } catch (error) {
      setMessage(error?.response?.data?.message || 'No se pudieron cargar órdenes');
      setOrders([]);
    } finally {
      setLoadingOrders(false);
    }
  };

  const loadPendingRequests = async () => {
    try {
      const [pendingResponse, approvedResponse, rejectedResponse] = await Promise.all([
        getOrderCancellationRequests({ status: 'pending' }),
        getOrderCancellationRequests({ status: 'approved' }),
        getOrderCancellationRequests({ status: 'rejected' }),
      ]);

      setPendingRequests(pendingResponse.data || []);
      setHistoryRequests([...(approvedResponse.data || []), ...(rejectedResponse.data || [])]);
    } catch (error) {
      setPendingRequests([]);
      setHistoryRequests([]);
    }
  };

  useEffect(() => {
    if (!successModal.open) {
      return undefined;
    }

    const fadeTimer = setTimeout(() => {
      setSuccessModal((prev) => ({ ...prev, fading: true }));
    }, 2700);

    const closeTimer = setTimeout(() => {
      setSuccessModal({ open: false, fading: false });
    }, 3000);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(closeTimer);
    };
  }, [successModal.open]);

  useEffect(() => {
    const init = async () => {
      const closed = await loadDayStatus();
      if (closed) {
        return;
      }

      await Promise.all([
        loadOrders(),
        loadPendingRequests(),
        getStudents()
          .then((response) => setStudents(response.data || []))
          .catch(() => setStudents([])),
      ]);
    };

    init();
  }, []);

  const studentNameMap = useMemo(() => {
    const map = new Map();
    for (const student of students) {
      map.set(String(student._id), {
        name: student.name || 'N/A',
        schoolCode: student.schoolCode || '',
      });
    }
    return map;
  }, [students]);

  const resolveStudent = (studentRef) => {
    if (!studentRef) {
      return { name: 'Venta externa', schoolCode: '' };
    }

    if (typeof studentRef === 'object') {
      return {
        name: studentRef.name || studentNameMap.get(String(studentRef._id || ''))?.name || 'N/A',
        schoolCode: studentRef.schoolCode || studentNameMap.get(String(studentRef._id || ''))?.schoolCode || '',
      };
    }

    return studentNameMap.get(String(studentRef)) || { name: 'N/A', schoolCode: '' };
  };

  const requestCancel = async (orderId) => {
    if (submitting) {
      return;
    }

    if (dayClosed) {
      setMessage('Ya cerraste el día. No puedes solicitar anulaciones.');
      return;
    }

    try {
      setSubmitting(true);
      await requestOrderCancellation({ orderId, reason: 'Solicitud desde portal vendedor' });
      setSuccessModal({ open: true, fading: false });
      setMessage('Solicitud enviada. Debe ser autorizada por el administrador.');
      await loadPendingRequests();
    } catch (error) {
      setMessage(error?.response?.data?.message || 'No se pudo solicitar anulación');
    } finally {
      setSubmitting(false);
    }
  };

  const pendingOrderIds = new Set(pendingRequests.map((request) => String(request.orderId?._id || request.orderId)));
  const studentOptions = useMemo(() => {
    return (students || []).map((student) => ({
      id: String(student._id),
      name: student.name || 'N/A',
      schoolCode: student.schoolCode || '',
    }));
  }, [students]);

  const filteredStudentOptions = useMemo(() => {
    const query = studentQuery.trim().toLowerCase();
    if (!query) {
      return studentOptions;
    }

    return studentOptions.filter((student) => student.name.toLowerCase().includes(query));
  }, [studentOptions, studentQuery]);

  const visibleOrders = useMemo(() => {
    if (!isVendor || !currentStore?._id) {
      return orders;
    }

    return orders.filter((order) => String(order?.storeId?._id || '') === String(currentStore._id));
  }, [orders, isVendor, currentStore?._id]);

  const productOptions = useMemo(() => {
    const map = new Map();

    for (const order of visibleOrders) {
      for (const item of order?.items || []) {
        const key = String(item?.productId?._id || item?.productId || item?._id || '').trim();
        const label = String(item?.nameSnapshot || item?.productId?.name || '').trim();

        if (!label) {
          continue;
        }

        const normalizedKey = key || `name:${label.toLowerCase()}`;
        if (!map.has(normalizedKey)) {
          map.set(normalizedKey, { key: normalizedKey, label });
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'es'));
  }, [visibleOrders]);

  const filteredProductOptions = useMemo(() => {
    const query = String(productQuery || '').trim().toLowerCase();
    if (!query) {
      return productOptions;
    }

    return productOptions.filter((option) => option.label.toLowerCase().includes(query));
  }, [productOptions, productQuery]);

  const onChangeFilter = (key, value) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const onChangeSearchType = (value) => {
    if (value === 'product') {
      setFilters((prev) => ({
        ...prev,
        searchType: 'product',
        studentId: '',
      }));
      setStudentQuery('');
      setShowStudentOptions(false);
      setProductQuery('');
      setShowProductOptions(true);
      return;
    }

    setFilters((prev) => ({
      ...prev,
      searchType: 'student',
      productKey: '',
    }));
    setStudentQuery('');
    setShowStudentOptions(false);
    setProductQuery('');
    setShowProductOptions(false);
  };

  const onSelectStudentOption = (student) => {
    setFilters((prev) => ({
      ...prev,
      studentId: student.id,
    }));
    setStudentQuery(student.schoolCode ? `${student.name} (${student.schoolCode})` : student.name);
    setShowStudentOptions(false);
  };

  const onSelectProductOption = (option) => {
    setFilters((prev) => ({
      ...prev,
      productKey: option.key,
    }));
    setProductQuery(option.label);
    setShowProductOptions(false);
  };

  const onSearch = async () => {
    const closed = await loadDayStatus();
    if (!closed) {
      loadOrders(filters);
    }
  };

  const onClear = async () => {
    const emptyFilters = {
      from: todayYmd(),
      to: todayYmd(),
      searchType: 'student',
      studentId: '',
      productKey: '',
    };
    setFilters(emptyFilters);
    setStudentQuery('');
    setShowStudentOptions(false);
    setProductQuery('');
    setShowProductOptions(false);
    setOnlyExternalSales(false);
    const closed = await loadDayStatus();
    if (!closed) {
      loadOrders(emptyFilters);
    }
  };

  const filteredOrders = visibleOrders.filter((order) => {
    if (onlyExternalSales && !order.guestSale) {
      return false;
    }

    if (filters.searchType === 'product' && filters.productKey) {
      return (order?.items || []).some((item) => {
        const itemProductId = String(item?.productId?._id || item?.productId || item?._id || '').trim();
        const itemName = String(item?.nameSnapshot || item?.productId?.name || '').trim().toLowerCase();

        if (filters.productKey.startsWith('name:')) {
          return `name:${itemName}` === filters.productKey;
        }

        return itemProductId === filters.productKey;
      });
    }

    return true;
  });

  return (
    <div className="page-grid single">
      <section className="panel">
        <h2>CANCELAR VENTA</h2>

        <div className="admin-form-grid">
          <label>
            Buscar por
            <select
              value={filters.searchType}
              onChange={(event) => onChangeSearchType(event.target.value)}
            >
              <option value="student">Alumno</option>
              <option value="product">Producto</option>
            </select>
          </label>

          <label>
            Fecha desde
            <input
              type="date"
              value={filters.from}
              onChange={(event) => onChangeFilter('from', event.target.value)}
            />
          </label>

          <label>
            Fecha hasta
            <input
              type="date"
              value={filters.to}
              onChange={(event) => onChangeFilter('to', event.target.value)}
            />
          </label>

          {filters.searchType === 'student' ? (
            <label>
              Alumno
              <div className="product-picker">
                <input
                  placeholder="Escribe para filtrar alumnos"
                  value={studentQuery}
                  onFocus={() => setShowStudentOptions(true)}
                  onBlur={() => {
                    setTimeout(() => {
                      setShowStudentOptions(false);
                    }, 120);
                  }}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setStudentQuery(nextValue);
                    setShowStudentOptions(true);
                    setFilters((prev) => ({
                      ...prev,
                      studentId: '',
                    }));
                  }}
                />
                {showStudentOptions ? (
                  <div className="product-picker-menu">
                    <button
                      className="product-picker-option"
                      type="button"
                      onMouseDown={() => {
                        setFilters((prev) => ({
                          ...prev,
                          studentId: '',
                        }));
                        setStudentQuery('');
                        setShowStudentOptions(false);
                      }}
                    >
                      Todos
                    </button>
                    {filteredStudentOptions.map((student) => (
                      <button
                        className="product-picker-option"
                        key={student.id}
                        onMouseDown={() => onSelectStudentOption(student)}
                        type="button"
                      >
                        {student.name} {student.schoolCode ? `(${student.schoolCode})` : ''}
                      </button>
                    ))}
                    {filteredStudentOptions.length === 0 ? (
                      <p className="product-picker-empty">Sin coincidencias</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </label>
          ) : (
            <label>
              Producto
              <div className="product-picker">
                <input
                  type="text"
                  value={productQuery}
                  placeholder="Escribe para filtrar productos"
                  onFocus={() => setShowProductOptions(true)}
                  onBlur={() => {
                    setTimeout(() => {
                      setShowProductOptions(false);
                    }, 120);
                  }}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setProductQuery(nextValue);
                    setShowProductOptions(true);
                    setFilters((prev) => ({
                      ...prev,
                      productKey: '',
                    }));
                  }}
                />
                {showProductOptions ? (
                  <div className="product-picker-menu">
                    {filteredProductOptions.length > 0 ? (
                      filteredProductOptions.map((option) => (
                        <button
                          className="product-picker-option"
                          key={option.key}
                          onMouseDown={() => onSelectProductOption(option)}
                          type="button"
                        >
                          {option.label}
                        </button>
                      ))
                    ) : (
                      <p className="product-picker-empty">Sin coincidencias</p>
                    )}
                  </div>
                ) : null}
              </div>
            </label>
          )}

          <div className="admin-cost-summary-row">
            <button className="btn btn-primary" type="button" onClick={onSearch} disabled={loadingOrders}>
              {loadingOrders ? 'Buscando...' : 'Buscar'}
            </button>
            <button className="btn btn-outline" type="button" onClick={onClear} disabled={loadingOrders}>
              Limpiar
            </button>
            <button
              className="btn"
              type="button"
              onClick={async () => {
                const closed = await loadDayStatus();
                if (!closed) {
                  loadOrders(filters);
                }
              }}
              disabled={loadingOrders}
            >
              Recargar órdenes
            </button>
          </div>
        </div>

        {dayClosed ? <p>Día cerrado: órdenes y anulaciones reiniciadas en 0.</p> : null}

        <label className="payment-option">
          <input
            type="checkbox"
            checked={onlyExternalSales}
            onChange={(event) => setOnlyExternalSales(event.target.checked)}
          />
          <span>Mostrar solo ventas externas</span>
        </label>

        <div className="panel soft page-scroll-list">
          {filteredOrders.length === 0 ? <p>{loadingOrders ? 'Cargando órdenes...' : 'No hay órdenes para mostrar.'}</p> : null}

          {filteredOrders.map((order) => (
            <div className="card" key={order._id}>
              <p>Orden: {order._id}</p>
              <p>
                Alumno: {resolveStudent(order.studentId).name}
                {resolveStudent(order.studentId).schoolCode ? ` (${resolveStudent(order.studentId).schoolCode})` : ''}
              </p>
              <p>Productos: {(order.items || []).map((item) => `${item.quantity}x ${item.nameSnapshot}`).join(', ') || 'N/A'}</p>
              {order.guestSale ? <p>Tipo: Venta externa</p> : null}
              <p>Método: {order.paymentMethod}</p>
              <p>Total: ${Number(order.total).toLocaleString('es-CO')}</p>
              <p>Fecha: {formatDateTime(order.createdAt)}</p>
              {pendingOrderIds.has(String(order._id)) ? (
                <p>Anulación pendiente</p>
              ) : (
                <button className="btn btn-primary" type="button" onClick={() => requestCancel(order._id)} disabled={dayClosed || submitting}>
                  {submitting ? 'Enviando...' : 'Solicitar anulación'}
                </button>
              )}
            </div>
          ))}
        </div>

        <section className="panel soft">
          <h3>ANULACIONES PENDIENTES</h3>
          <button
            className="btn"
            type="button"
            onClick={async () => {
              const closed = await loadDayStatus();
              if (!closed) {
                loadPendingRequests();
              }
            }}
          >
            Actualizar
          </button>

          {pendingRequests.length === 0 ? <p>No hay anulaciones pendientes.</p> : null}

          <div className="page-scroll-list">
            {pendingRequests.map((request) => (
              <div className="card" key={request._id}>
                <p>Orden: {request.orderId?._id || request.orderId}</p>
                <p>
                  Alumno: {resolveStudent(request.orderId?.studentId).name}
                  {resolveStudent(request.orderId?.studentId).schoolCode ? ` (${resolveStudent(request.orderId?.studentId).schoolCode})` : ''}
                </p>
                {request.orderId?.guestSale ? <p>Tipo: Venta externa</p> : null}
                <p>Método: {request.orderId?.paymentMethod || 'N/A'}</p>
                <p>Total: ${Number(request.orderId?.total || 0).toLocaleString('es-CO')}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="panel soft">
          <h3>HISTORIAL DE ANULACIONES</h3>
          {historyRequests.length === 0 ? <p>No hay anulaciones aprobadas o rechazadas.</p> : null}

          <div className="approval-history-scroll">
            {historyRequests.map((request) => (
              <div className="card" key={request._id}>
                <p>Orden: {request.orderId?._id || request.orderId}</p>
                <p>
                  Alumno: {resolveStudent(request.orderId?.studentId).name}
                  {resolveStudent(request.orderId?.studentId).schoolCode ? ` (${resolveStudent(request.orderId?.studentId).schoolCode})` : ''}
                </p>
                {request.orderId?.guestSale ? <p>Tipo: Venta externa</p> : null}
                <p>Método: {request.orderId?.paymentMethod || 'N/A'}</p>
                <p>Total: ${Number(request.orderId?.total || 0).toLocaleString('es-CO')}</p>
                <p>Estado: {request.status === 'approved' ? 'Aprobada' : 'Rechazada'}</p>
                <p>Fecha: {formatDateTime(request.approvedAt || request.rejectedAt || request.updatedAt)}</p>
              </div>
            ))}
          </div>
        </section>

        <DismissibleNotice text={message} type="info" onClose={() => setMessage('')} />
      </section>

      {successModal.open ? (
        <div className={`brand-popup-overlay ${successModal.fading ? 'inventory-apply-overlay-fading' : ''}`} role="status" aria-live="polite">
          <div className={`brand-popup brand-popup-success ${successModal.fading ? 'inventory-apply-popup-fading' : ''}`}>
            <h3>Solicitud enviada</h3>
            <p>La solicitud de anulación fue registrada correctamente.</p>
          </div>
        </div>
      ) : null}

      {submitting ? (
        <div className="brand-popup-overlay" role="status" aria-live="polite" aria-busy="true">
          <div className="brand-popup">
            <div className="legacy-migration-spinner" aria-hidden="true" />
            <h3>Cargando...</h3>
            <p>Estamos procesando tu solicitud. Por favor espera.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default CancelSale;
