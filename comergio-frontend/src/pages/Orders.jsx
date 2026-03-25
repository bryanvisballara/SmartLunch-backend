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
    searchType: 'student',
    studentId: '',
    productKey: '',
  });
  const [studentQuery, setStudentQuery] = useState('');
  const [showStudentOptions, setShowStudentOptions] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const [showProductOptions, setShowProductOptions] = useState(false);
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
          map.set(normalizedKey, {
            key: normalizedKey,
            label,
          });
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'es'));
  }, [visibleOrders]);

  const filteredProductOptions = useMemo(() => {
    const queryText = String(productQuery || '').trim().toLowerCase();
    if (!queryText) {
      return productOptions;
    }

    return productOptions.filter((option) => option.label.toLowerCase().includes(queryText));
  }, [productOptions, productQuery]);

  const studentOptions = useMemo(() => {
    return (students || []).map((student) => ({
      id: String(student._id),
      name: student.name || 'N/A',
      schoolCode: student.schoolCode || '',
    }));
  }, [students]);

  const filteredStudentOptions = useMemo(() => {
    const queryText = String(studentQuery || '').trim().toLowerCase();
    if (!queryText) {
      return studentOptions;
    }

    return studentOptions.filter((student) => {
      const name = String(student.name || '').toLowerCase();
      const schoolCode = String(student.schoolCode || '').toLowerCase();
      return name.includes(queryText) || schoolCode.includes(queryText);
    });
  }, [studentOptions, studentQuery]);

  const finalVisibleOrders = useMemo(() => {
    if (filters.searchType !== 'product' || !filters.productKey) {
      return visibleOrders;
    }

    return visibleOrders.filter((order) =>
      (order?.items || []).some((item) => {
        const itemProductId = String(item?.productId?._id || item?.productId || item?._id || '').trim();
        const itemName = String(item?.nameSnapshot || item?.productId?.name || '').trim().toLowerCase();

        if (filters.productKey.startsWith('name:')) {
          return `name:${itemName}` === filters.productKey;
        }

        return itemProductId === filters.productKey;
      })
    );
  }, [visibleOrders, filters.searchType, filters.productKey]);

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

  const onSearch = () => {
    loadOrders(filters);
  };

  const onClear = () => {
    const emptyFilters = { from: '', to: '', searchType: 'student', studentId: '', productKey: '' };
    setFilters(emptyFilters);
    setStudentQuery('');
    setShowStudentOptions(false);
    setProductQuery('');
    setShowProductOptions(false);
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
                  type="text"
                  value={studentQuery}
                  placeholder="Escribe para filtrar alumnos"
                  onFocus={() => setShowStudentOptions(true)}
                  onBlur={() => {
                    setTimeout(() => setShowStudentOptions(false), 120);
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
                    {filteredStudentOptions.length > 0 ? (
                      filteredStudentOptions.map((student) => (
                        <button
                          className="product-picker-option"
                          key={student.id}
                          type="button"
                          onMouseDown={() => onSelectStudentOption(student)}
                        >
                          {student.name} {student.schoolCode ? `(${student.schoolCode})` : ''}
                        </button>
                      ))
                    ) : (
                      <p className="product-picker-empty">Sin coincidencias</p>
                    )}
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
                          type="button"
                          onClick={() => onSelectProductOption(option)}
                        >
                          {option.label}
                        </button>
                      ))
                    ) : (
                      <p className="product-picker-empty">No hay productos que coincidan.</p>
                    )}
                  </div>
                ) : null}
              </div>
            </label>
          )}

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
              {finalVisibleOrders.length === 0 ? (
                <tr>
                  <td colSpan={6}>{loading ? 'Cargando ordenes...' : 'No hay ordenes para mostrar.'}</td>
                </tr>
              ) : (
                finalVisibleOrders.map((order) => (
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
