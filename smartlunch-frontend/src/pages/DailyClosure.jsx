import { useEffect, useState } from 'react';
import { createDailyClosure, getDailyClosureSummary } from '../services/dailyClosure.service';
import useAuthStore from '../store/auth.store';
import DismissibleNotice from '../components/DismissibleNotice';

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function todayLongEs() {
  const now = new Date();
  const weekday = new Intl.DateTimeFormat('es-CO', { weekday: 'long' }).format(now);
  const month = new Intl.DateTimeFormat('es-CO', { month: 'long' }).format(now);
  const day = now.getDate();
  const year = now.getFullYear();
  const weekdayLabel = weekday.charAt(0).toUpperCase() + weekday.slice(1);

  return `${weekdayLabel}, ${day} de ${month} del ${year}`;
}

function DailyClosure() {
  const { currentStore } = useAuthStore();
  const [summary, setSummary] = useState(null);
  const [date] = useState(todayYmd());
  const [baseInitial, setBaseInitial] = useState('0');
  const [baseFinal, setBaseFinal] = useState('0');
  const [countedCash, setCountedCash] = useState('0');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');
  const [dayClosed, setDayClosed] = useState(false);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [savedClosure, setSavedClosure] = useState(null);
  const todayLabel = todayLongEs();

  const baseInitialNumber = Number(baseInitial || 0);
  const baseFinalNumber = Number(baseFinal || 0);
  const countedCashNumber = Number(countedCash || 0);
  const systemCashNumber = Number(summary?.totalSoloEfectivoSistema || 0);
  const expectedCashNumber = systemCashNumber + baseInitialNumber - baseFinalNumber;
  const totalCashSavedNumber = countedCashNumber - baseFinalNumber;
  const balanceNumber = countedCashNumber - (systemCashNumber + baseInitialNumber);

  const loadSummary = async () => {
    if (!currentStore?._id) {
      setMessage('No hay una tienda activa en la sesión POS.');
      return;
    }

    try {
      const response = await getDailyClosureSummary({ storeId: currentStore._id });
      setSummary(response.data);
      setBaseInitial(String(response.data.baseInicial ?? 0));
      setBaseFinal(String(response.data.baseFinal ?? 0));
      setCountedCash(String(response.data.totalSoloEfectivoReal ?? 0));
      setNotes(String(response.data.notes ?? ''));
      setDayClosed(Boolean(response.data.isClosed));
      setMessage('');
    } catch (error) {
      setMessage(error?.response?.data?.message || 'No se pudo cargar resumen de cierre');
    }
  };

  useEffect(() => {
    loadSummary();
  }, [currentStore?._id]);

  const saveClosure = async () => {
    if (!currentStore?._id || !summary) {
      setMessage('Debes tener una tienda activa en POS y cargar el resumen.');
      return;
    }

    if (dayClosed) {
      setMessage('El cierre de hoy ya fue ejecutado');
      return;
    }

    try {
      const response = await createDailyClosure({
        storeId: currentStore._id,
        date,
        systemCash: summary.ingresosEfectivo,
        systemQr: summary.ingresosQr,
        systemTransfer: summary.ingresosTransfer,
        systemDataphone: summary.ingresosDatafono,
        systemWallet: summary.ingresosSistema,
        baseFinal: Number(baseFinal),
        countedCash: Number(countedCash),
        notes,
      });

      const nextBaseInitial = Number(response.data?.baseFinal || 0);
      setSavedClosure({
        totalVentas: Number(response.data?.totalSales || 0),
        baseInicial: Number(response.data?.baseInitial || 0),
        baseFinal: Number(response.data?.baseFinal || 0),
        efectivoReal: Number(response.data?.countedCash || 0),
      });

      setSummary((previous) => ({
        ...(previous || {}),
        ingresosEfectivo: 0,
        ingresosDatafono: 0,
        ingresosQr: 0,
        ingresosSistema: 0,
        ingresosTransfer: 0,
        totalIngresos: 0,
        totalSoloEfectivoSistema: 0,
      }));
      setBaseInitial(String(nextBaseInitial));
      setBaseFinal('0');
      setCountedCash('0');
      setNotes('');
      setDayClosed(true);
      setShowSuccessPopup(true);
      setMessage('');
    } catch (error) {
      setMessage(error?.response?.data?.message || 'No se pudo guardar cierre diario');
    }
  };

  return (
    <div className="page-grid single">
      <section className="panel">
        <h2>Cierre diario - {todayLabel}</h2>

        <div className="row gap">
          <input value={currentStore?.name || 'Sin tienda activa en POS'} readOnly disabled />
          <button className="btn" type="button" onClick={loadSummary} disabled={!currentStore?._id}>
            Actualizar
          </button>
        </div>

        {summary ? (
          <div className="cards">
            <div className="card"><p>Efectivo: ${Number(summary.ingresosEfectivo).toLocaleString('es-CO')}</p></div>
            <div className="card"><p>Datáfono: ${Number(summary.ingresosDatafono).toLocaleString('es-CO')}</p></div>
            <div className="card"><p>QR: ${Number(summary.ingresosQr).toLocaleString('es-CO')}</p></div>
            <div className="card"><p>Sistema: ${Number(summary.ingresosSistema).toLocaleString('es-CO')}</p></div>
            <div className="card"><p>Total: ${Number(summary.totalIngresos).toLocaleString('es-CO')}</p></div>
            <div className="card"><p>Efectivo esperado en caja: ${expectedCashNumber.toLocaleString('es-CO')}</p></div>
            <div className="card"><p>Base inicial: ${baseInitialNumber.toLocaleString('es-CO')}</p></div>
            <div className="card"><p>Efectivo real: ${countedCashNumber.toLocaleString('es-CO')}</p></div>
            <div className="card"><p>Base final: ${baseFinalNumber.toLocaleString('es-CO')}</p></div>
            <div className="card"><p>Efectivo guardado: ${totalCashSavedNumber.toLocaleString('es-CO')}</p></div>
            <div className="card"><p>Balance: ${balanceNumber.toLocaleString('es-CO')}</p></div>
          </div>
        ) : null}

        <div className="row gap">
          <label>
            Base inicial
            <input value={baseInitial} type="number" readOnly disabled />
          </label>
          <label>
            Efectivo real contado
            <input value={countedCash} onChange={(event) => setCountedCash(event.target.value)} type="number" disabled={dayClosed} />
          </label>
          <label>
            Base final
            <input value={baseFinal} onChange={(event) => setBaseFinal(event.target.value)} type="number" disabled={dayClosed} />
          </label>
        </div>

        <label>
          Observaciones
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            placeholder="Escribe aquí observaciones del cierre"
            disabled={dayClosed}
          />
        </label>

        <button className="btn btn-primary" type="button" onClick={saveClosure} disabled={dayClosed}>
          Ejecutar cierre
        </button>
        {dayClosed ? <p>El cierre de hoy ya fue ejecutado.</p> : null}
        <DismissibleNotice text={message} type="info" onClose={() => setMessage('')} />
      </section>

      {showSuccessPopup ? (
        <div className="success-overlay" role="dialog" aria-modal="true" aria-label="Cierre guardado">
          <div className="success-modal">
            <div className="success-icon" aria-hidden="true">OK</div>
            <h3>Cierre guardado con éxito</h3>
            <p>La información fue almacenada correctamente en el sistema.</p>
            {savedClosure ? (
              <div className="success-order-summary">
                <p>Total ventas del cierre: ${savedClosure.totalVentas.toLocaleString('es-CO')}</p>
                <p>Base inicial aplicada: ${savedClosure.baseInicial.toLocaleString('es-CO')}</p>
                <p>Base final reportada: ${savedClosure.baseFinal.toLocaleString('es-CO')}</p>
                <p>Efectivo real contado: ${savedClosure.efectivoReal.toLocaleString('es-CO')}</p>
              </div>
            ) : null}
            <button className="btn btn-primary" type="button" onClick={() => setShowSuccessPopup(false)}>
              Cerrar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default DailyClosure;
