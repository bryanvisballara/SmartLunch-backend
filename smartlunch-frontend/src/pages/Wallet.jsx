import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { getBalance, getHistory, topup } from '../services/wallet.service';
import DismissibleNotice from '../components/DismissibleNotice';

function Wallet() {
  const [studentId, setStudentId] = useState('');
  const [balance, setBalance] = useState(null);
  const [history, setHistory] = useState([]);
  const [amount, setAmount] = useState('20000');
  const [message, setMessage] = useState('');

  const balanceMutation = useMutation({
    mutationFn: getBalance,
    onSuccess: (response) => setBalance(response.data.balance),
    onError: (error) => setMessage(error?.response?.data?.message || 'Error cargando saldo'),
  });

  const historyMutation = useMutation({
    mutationFn: getHistory,
    onSuccess: (response) => setHistory(response.data || []),
    onError: (error) => setMessage(error?.response?.data?.message || 'Error cargando historial'),
  });

  const topupMutation = useMutation({
    mutationFn: topup,
    onSuccess: () => {
      setMessage('Recarga realizada');
      if (studentId) {
        balanceMutation.mutate(studentId);
        historyMutation.mutate(studentId);
      }
    },
    onError: (error) => setMessage(error?.response?.data?.message || 'Error en recarga'),
  });

  return (
    <div className="page-grid single">
      <section className="panel">
        <h2>Wallet estudiantes</h2>
        <input placeholder="Student ID" value={studentId} onChange={(e) => setStudentId(e.target.value)} />
        <div className="row gap">
          <button className="btn" onClick={() => balanceMutation.mutate(studentId)} type="button">
            Ver saldo
          </button>
          <button className="btn" onClick={() => historyMutation.mutate(studentId)} type="button">
            Ver historial
          </button>
        </div>
        {balance !== null ? <p>Saldo: ${Number(balance).toLocaleString('es-CO')}</p> : null}
      </section>

      <section className="panel">
        <h3>Recargar</h3>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button
          className="btn btn-primary"
          onClick={() => topupMutation.mutate({ studentId, amount: Number(amount), method: 'transfer' })}
          type="button"
        >
          Recargar
        </button>
        <DismissibleNotice text={message} type="info" onClose={() => setMessage('')} />
      </section>

      <section className="panel">
        <h3>Historial</h3>
        {history.map((item) => (
          <div className="row" key={item._id}>
            <span>{item.type}</span>
            <span>${Number(item.amount).toLocaleString('es-CO')}</span>
          </div>
        ))}
      </section>
    </div>
  );
}

export default Wallet;
