import { useEffect, useMemo, useState } from 'react';
import { getOrderCancellationRequests, getOrders, requestOrderCancellation } from '../services/orders.service';
import { getStudents } from '../services/students.service';
import { getDailyClosures } from '../services/dailyClosure.service';
import DismissibleNotice from '../components/DismissibleNotice';

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function CancelSale() {
  const [orders, setOrders] = useState([]);
  const [studentQuery, setStudentQuery] = useState('');
  const [showStudentSuggestions, setShowStudentSuggestions] = useState(false);
  const [students, setStudents] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [message, setMessage] = useState('');
  const [dayClosed, setDayClosed] = useState(false);
  const [onlyExternalSales, setOnlyExternalSales] = useState(false);

  const resetPage = () => {
    setOrders([]);
    setPendingRequests([]);
    setStudentQuery('');
    setShowStudentSuggestions(false);
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

  const loadOrders = async () => {
    try {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
      const response = await getOrders({ from, to });
      setOrders((response.data || []).filter((order) => order.status === 'completed').slice(0, 100));
    } catch (error) {
      setMessage(error?.response?.data?.message || 'No se pudieron cargar órdenes');
    }
  };

  const loadPendingRequests = async () => {
    try {
      const response = await getOrderCancellationRequests({ status: 'pending' });
      setPendingRequests(response.data || []);
    } catch (error) {
      setPendingRequests([]);
    }
  };

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
    if (dayClosed) {
      setMessage('Ya cerraste el día. No puedes solicitar anulaciones.');
      return;
    }

    try {
      await requestOrderCancellation({ orderId, reason: 'Solicitud desde portal vendedor' });
      setMessage('Solicitud enviada. Debe ser autorizada por el administrador.');
      await loadPendingRequests();
    } catch (error) {
      setMessage(error?.response?.data?.message || 'No se pudo solicitar anulación');
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

  const filteredOrders = orders.filter((order) => {
    if (onlyExternalSales && !order.guestSale) {
      return false;
    }

    const resolved = resolveStudent(order.studentId);
    const name = String(resolved.name || '').toLowerCase();
    const query = studentQuery.trim().toLowerCase();
    if (!query) {
      return true;
    }

    return name.includes(query);
  });

  return (
    <div className="page-grid single">
      <section className="panel">
        <h2>CANCELAR VENTA</h2>
        <label>
          Buscar por alumno
          <div className="product-picker">
            <input
              placeholder="Escribe el nombre del alumno"
              value={studentQuery}
              onFocus={() => setShowStudentSuggestions(true)}
              onBlur={() => {
                setTimeout(() => {
                  setShowStudentSuggestions(false);
                }, 120);
              }}
              onChange={(event) => setStudentQuery(event.target.value)}
            />
            {showStudentSuggestions ? (
              <div className="product-picker-menu">
                {filteredStudentOptions.map((student) => (
                  <button
                    className="product-picker-option"
                    key={student.id}
                    onMouseDown={() => {
                      setStudentQuery(student.name);
                      setShowStudentSuggestions(false);
                    }}
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
        <button
          className="btn"
          type="button"
          onClick={async () => {
            const closed = await loadDayStatus();
            if (!closed) {
              loadOrders();
            }
          }}
        >
          Recargar órdenes
        </button>

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
          {filteredOrders.map((order) => (
            <div className="card" key={order._id}>
              <p>Orden: {order._id}</p>
              <p>
                Alumno: {resolveStudent(order.studentId).name}
                {resolveStudent(order.studentId).schoolCode ? ` (${resolveStudent(order.studentId).schoolCode})` : ''}
              </p>
              {order.guestSale ? <p>Tipo: Venta externa</p> : null}
              <p>Método: {order.paymentMethod}</p>
              <p>Total: ${Number(order.total).toLocaleString('es-CO')}</p>
              {pendingOrderIds.has(String(order._id)) ? (
                <p>Anulación pendiente</p>
              ) : (
                <button className="btn btn-primary" type="button" onClick={() => requestCancel(order._id)} disabled={dayClosed}>
                  Solicitar anulación
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

        <DismissibleNotice text={message} type="info" onClose={() => setMessage('')} />
      </section>
    </div>
  );
}

export default CancelSale;
