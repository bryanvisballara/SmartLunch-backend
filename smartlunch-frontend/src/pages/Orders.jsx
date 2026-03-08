import { useEffect, useMemo, useState } from 'react';
import { getOrders } from '../services/orders.service';
import { getStudents } from '../services/students.service';
import useAuthStore from '../store/auth.store';

function Orders() {
  const { user, currentStore } = useAuthStore();
  const [orders, setOrders] = useState([]);
  const [students, setStudents] = useState([]);
  const [filters, setFilters] = useState({
    from: '',
    to: '',
    studentId: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isVendor = user?.role === 'vendor';

  const normalizeDateForApi = (value, isEndOfDay = false) => {
    if (!value) {
      return null;
    }

    const suffix = isEndOfDay ? 'T23:59:59.999' : 'T00:00:00.000';
    return new Date(`${value}${suffix}`).toISOString();
  };

  const loadStudents = async () => {
    try {
      const response = await getStudents();
      setStudents(Array.isArray(response.data) ? response.data : []);
    } catch (studentsError) {
      // Orders can still be consulted even if student filter options fail to load.
      setStudents([]);
    }
  };

  const loadOrders = async (nextFilters = filters) => {
    setLoading(true);
    setError('');

    try {
      const params = {};
      if (nextFilters.studentId) {
        params.studentId = nextFilters.studentId;
      }
      if (nextFilters.from) {
        params.from = normalizeDateForApi(nextFilters.from);
      }
      if (nextFilters.to) {
        params.to = normalizeDateForApi(nextFilters.to, true);
      }

      const response = await getOrders(params);
      const fetchedOrders = Array.isArray(response.data) ? response.data : [];
      setOrders(fetchedOrders);
    } catch (ordersError) {
      setError(ordersError?.response?.data?.message || 'No se pudieron cargar las ordenes.');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStudents();
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleOrders = useMemo(() => {
    if (!isVendor || !currentStore?._id) {
      return orders;
    }

    return orders.filter((order) => String(order?.storeId?._id || '') === String(currentStore._id));
  }, [orders, isVendor, currentStore?._id]);

  const onChangeFilter = (key, value) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const onSearch = () => {
    loadOrders(filters);
  };

  const onClear = () => {
    const emptyFilters = { from: '', to: '', studentId: '' };
    setFilters(emptyFilters);
    loadOrders(emptyFilters);
  };

  const formatPaymentMethod = (method) => {
    const labels = {
      system: 'Saldo',
      cash: 'Efectivo',
      transfer: 'Transferencia',
      qr: 'QR',
      dataphone: 'Datáfono',
    };

    return labels[method] || method || '-';
  };

  const formatDateTime = (value) => {
    if (!value) {
      return '-';
    }

    return new Date(value).toLocaleString('es-CO', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatOrderItems = (items) => {
    if (!Array.isArray(items) || items.length === 0) {
      return '-';
    }

    return items.map((item) => `${item.quantity}x ${item.nameSnapshot}`).join(', ');
  };

  const formatOrderNumber = (id) => {
    if (!id) {
      return '-';
    }

    return `#${String(id).slice(-8).toUpperCase()}`;
  };

  return (
    <div className="page-grid single">
      <section className="panel">
        <h2>Ordenes</h2>

        <div className="admin-form-grid">
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

          <label>
            Alumno
            <select
              value={filters.studentId}
              onChange={(event) => onChangeFilter('studentId', event.target.value)}
            >
              <option value="">Todos</option>
              {students.map((student) => (
                <option key={student._id} value={student._id}>
                  {student.name}
                </option>
              ))}
            </select>
          </label>

          <div className="admin-cost-summary-row">
            <button className="btn btn-primary" type="button" onClick={onSearch} disabled={loading}>
              {loading ? 'Buscando...' : 'Buscar'}
            </button>
            <button className="btn btn-outline" type="button" onClick={onClear} disabled={loading}>
              Limpiar
            </button>
          </div>
        </div>

        {error ? <p className="helper error-text">{error}</p> : null}

        <div className="page-scroll-list">
          <table className="simple-table">
            <thead>
              <tr>
                <th>#pedido</th>
                <th>Alumno</th>
                <th>Orden</th>
                <th>Metodo de pago</th>
                <th>Total</th>
                <th>Fecha y hora</th>
              </tr>
            </thead>
            <tbody>
              {visibleOrders.length === 0 ? (
                <tr>
                  <td colSpan={6}>{loading ? 'Cargando ordenes...' : 'No hay ordenes para mostrar.'}</td>
                </tr>
              ) : (
                visibleOrders.map((order) => (
                  <tr key={order._id}>
                    <td title={order._id}>{formatOrderNumber(order._id)}</td>
                    <td>{order.studentId?.name || (order.guestSale ? 'Venta externa' : 'Sin alumno')}</td>
                    <td>{formatOrderItems(order.items)}</td>
                    <td>{formatPaymentMethod(order.paymentMethod)}</td>
                    <td>${Number(order.total || 0).toLocaleString('es-CO')}</td>
                    <td>{formatDateTime(order.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default Orders;
