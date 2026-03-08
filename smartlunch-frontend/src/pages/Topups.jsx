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
  const [requests, setRequests] = useState([]);
  const [studentId, setStudentId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [message, setMessage] = useState('');

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

  const loadRequests = async () => {
    try {
      const response = await getTopupRequests({ status: 'pending' });
      setRequests(response.data || []);
    } catch (error) {
      setMessage(error?.response?.data?.message || 'No se pudieron cargar solicitudes');
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const onCreateRequest = async () => {
    if (!studentId || Number(amount) <= 0) {
      setMessage('Selecciona el alumno y un monto válido');
      return;
    }

    try {
      await createTopupRequest({
        studentId,
        amount: Number(amount),
        method,
        storeId: null,
        notes: `Recarga solicitada por vendedor (${selectedMethodLabel})`,
      });

      setAmount('');
      setMessage('Solicitud de recarga enviada. Pendiente de aprobación admin.');
      await loadRequests();
    } catch (error) {
      setMessage(error?.response?.data?.message || 'No se pudo crear la solicitud');
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

          <button className="btn" type="button" onClick={onCreateRequest}>
            Solicitar recarga
          </button>
        </section>

        <h3>Solicitudes pendientes</h3>
        <button className="btn" type="button" onClick={loadRequests}>
          Actualizar
        </button>

        {requests.map((request) => (
          <div className="card" key={request._id}>
            <p>Alumno: {request.studentId?.name || 'N/A'}</p>
            <p>Monto: ${Number(request.amount || 0).toLocaleString('es-CO')}</p>
            <p>Método: {request.method === 'cash' ? 'Efectivo' : request.method === 'qr' ? 'QR' : 'Datáfono'}</p>
            <p>Estado: {request.status}</p>
          </div>
        ))}

        <DismissibleNotice text={message} type="info" onClose={() => setMessage('')} />
      </section>
    </div>
  );
}

export default Topups;
