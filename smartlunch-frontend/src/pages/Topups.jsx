import { useEffect, useMemo, useState } from 'react';
import { getStudents } from '../services/students.service';
import { createTopupRequest, getTopupRequests } from '../services/wallet.service';
import DismissibleNotice from '../components/DismissibleNotice';

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'qr', label: 'QR' },
  { value: 'dataphone', label: 'Datáfono' },
];

function Topups() {
  const [students, setStudents] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [historyRequests, setHistoryRequests] = useState([]);
  const [studentId, setStudentId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [message, setMessage] = useState('');
  const [successModal, setSuccessModal] = useState({ open: false, fading: false });
  const [submitting, setSubmitting] = useState(false);

  const formatDateTime = (value) => (value ? new Date(value).toLocaleString('es-CO') : 'N/A');

  const selectedMethodLabel = useMemo(
    () => PAYMENT_METHODS.find((item) => item.value === method)?.label || 'Efectivo',
    [method]
  );

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const studentsResponse = await getStudents();
        setStudents(studentsResponse.data || []);
      } catch (error) {
        setMessage(error?.response?.data?.message || 'No se pudieron cargar los datos');
      }
    };

    loadInitialData();
  }, []);

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

  const loadRequests = async () => {
    try {
      const [pendingResponse, approvedResponse, rejectedResponse] = await Promise.all([
        getTopupRequests({ status: 'pending' }),
        getTopupRequests({ status: 'approved' }),
        getTopupRequests({ status: 'rejected' }),
      ]);

      setPendingRequests(pendingResponse.data || []);
      setHistoryRequests([...(approvedResponse.data || []), ...(rejectedResponse.data || [])]);
    } catch (error) {
      setMessage(error?.response?.data?.message || 'No se pudieron cargar solicitudes');
      setPendingRequests([]);
      setHistoryRequests([]);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const onCreateRequest = async () => {
    if (submitting) {
      return;
    }

    if (!studentId || Number(amount) <= 0) {
      setMessage('Selecciona el alumno y un monto válido');
      return;
    }

    try {
      setSubmitting(true);
      await createTopupRequest({
        studentId,
        amount: Number(amount),
        method,
        storeId: null,
        notes: `Recarga solicitada por vendedor (${selectedMethodLabel})`,
      });

      setAmount('');
      setSuccessModal({ open: true, fading: false });
      setMessage('Solicitud de recarga enviada. Pendiente de aprobación admin.');
      await loadRequests();
    } catch (error) {
      setMessage(error?.response?.data?.message || 'No se pudo crear la solicitud');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-grid single">
      <section className="panel">
        <h2>Recargas</h2>

        <section className="panel soft">
          <h3>Solicitar recarga</h3>

          <label>
            Selecciona el alumno
            <select value={studentId} onChange={(event) => setStudentId(event.target.value)}>
              <option value="">Selecciona alumno</option>
              {students.map((student) => (
                <option key={student._id} value={student._id}>
                  {student.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Cantidad recargada
            <input value={amount} onChange={(event) => setAmount(event.target.value)} type="number" min="1" />
          </label>

          <label>
            Método de pago
            <select value={method} onChange={(event) => setMethod(event.target.value)}>
              {PAYMENT_METHODS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <button className="btn" type="button" onClick={onCreateRequest} disabled={submitting}>
            {submitting ? 'Enviando...' : 'Solicitar recarga'}
          </button>
        </section>

        <h3>Solicitudes pendientes</h3>
        <button className="btn" type="button" onClick={loadRequests}>
          Actualizar
        </button>

        {pendingRequests.length === 0 ? <p>No hay solicitudes pendientes.</p> : null}

        {pendingRequests.map((request) => (
          <div className="card" key={request._id}>
            <p>Alumno: {request.studentId?.name || 'N/A'}</p>
            <p>Monto: ${Number(request.amount || 0).toLocaleString('es-CO')}</p>
            <p>Método: {request.method === 'cash' ? 'Efectivo' : request.method === 'qr' ? 'QR' : 'Datáfono'}</p>
            <p>Estado: {request.status}</p>
          </div>
        ))}

        <section className="panel soft">
          <h3>Historial</h3>
          {historyRequests.length === 0 ? <p>No hay recargas aprobadas o rechazadas.</p> : null}

          {historyRequests.length > 0 ? (
            <div className="approval-history-scroll">
              {historyRequests.map((request) => (
                <div className="card" key={request._id}>
                  <p>Alumno: {request.studentId?.name || 'N/A'}</p>
                  <p>Monto: ${Number(request.amount || 0).toLocaleString('es-CO')}</p>
                  <p>Método: {request.method === 'cash' ? 'Efectivo' : request.method === 'qr' ? 'QR' : 'Datáfono'}</p>
                  <p>Estado: {request.status === 'approved' ? 'Aprobada' : 'Rechazada'}</p>
                  <p>
                    Fecha: {formatDateTime(request.approvedAt || request.rejectedAt || request.updatedAt)}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <DismissibleNotice text={message} type="info" onClose={() => setMessage('')} />
      </section>

      {successModal.open ? (
        <div className={`brand-popup-overlay ${successModal.fading ? 'inventory-apply-overlay-fading' : ''}`} role="status" aria-live="polite">
          <div className={`brand-popup brand-popup-success ${successModal.fading ? 'inventory-apply-popup-fading' : ''}`}>
            <h3>Solicitud enviada</h3>
            <p>La solicitud de recarga fue registrada correctamente.</p>
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

export default Topups;
