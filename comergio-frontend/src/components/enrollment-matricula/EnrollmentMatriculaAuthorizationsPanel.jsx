import { useCallback, useEffect, useState } from 'react';
import {
  approveChargeAdjustmentRequest,
  approveEnrollmentMatriculaPurgeRequest,
  getChargeAdjustmentRequestsHistory,
  getChargeAdjustmentRequestsPending,
  getEnrollmentMatriculaPurgeRequestsHistory,
  getEnrollmentMatriculaPurgeRequestsPending,
  rejectChargeAdjustmentRequest,
  rejectEnrollmentMatriculaPurgeRequest,
} from '../../services/enrollmentMatricula.service';
import './MatriculaEnrollmentFlow.css';

function formatDateTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatCurrency(value = 0) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function resolveRequestMotive(item = {}) {
  if (item.actionType === 'adjust_charge_amount') {
    return String(item.notes || '').trim() || '—';
  }
  return String(item.notes || item.reason || item.requestNotes || '').trim() || '—';
}

function resolveStatusLabel(status = '') {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'approved') return 'Aprobada';
  if (normalized === 'rejected') return 'Rechazada';
  if (normalized === 'pending') return 'Pendiente';
  return status || '—';
}

function resolveRequestDetail(item = {}) {
  if (item.actionType === 'adjust_charge_amount') {
    return (
      <div className="enrollment-matricula-rectoria__evidence">
        <span>{item.studentName || '—'}</span>
        <span>{item.concept || 'Cobro académico'}</span>
        <span>
          {formatCurrency(item.currentAmount)} → {formatCurrency(item.proposedAmount)}
          {item.adjustmentModeLabel ? ` · ${item.adjustmentModeLabel}` : ''}
        </span>
      </div>
    );
  }

  if (item.actionType === 'delete_billing_payment') {
    return (
      <div className="enrollment-matricula-rectoria__evidence">
        <span>{item.studentName || '—'}</span>
        <span>{item.paymentConcept || 'Pago académico'}</span>
        <span>{formatCurrency(item.paymentAmount)} · {item.paymentMethodLabel || item.paymentMethod || '—'}</span>
      </div>
    );
  }

  if (item.actionType === 'clear_consent') {
    return (
      <div className="enrollment-matricula-rectoria__evidence">
        <span>{item.studentName || '—'}</span>
        <span>{item.parentName || 'Acudiente'}</span>
      </div>
    );
  }

  return item.recordCount || 0;
}

function sortByNewest(left, right, dateKey = 'submittedAt') {
  return new Date(right?.[dateKey] || right?.submittedAt || 0) - new Date(left?.[dateKey] || left?.submittedAt || 0);
}

function EnrollmentMatriculaAuthorizationsPanel({ onUpdated }) {
  const [requests, setRequests] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const [
        purgePendingResponse,
        adjustmentPendingResponse,
        purgeHistoryResponse,
        adjustmentHistoryResponse,
      ] = await Promise.all([
        getEnrollmentMatriculaPurgeRequestsPending(),
        getChargeAdjustmentRequestsPending().catch(() => ({ data: { items: [] } })),
        getEnrollmentMatriculaPurgeRequestsHistory().catch(() => ({ data: { items: [] } })),
        getChargeAdjustmentRequestsHistory().catch(() => ({ data: { items: [] } })),
      ]);

      const pending = [
        ...(purgePendingResponse.data?.items || []),
        ...(adjustmentPendingResponse.data?.items || []),
      ].sort((left, right) => sortByNewest(left, right, 'submittedAt'));

      const resolved = [
        ...(purgeHistoryResponse.data?.items || []),
        ...(adjustmentHistoryResponse.data?.items || []),
      ].sort((left, right) => sortByNewest(left, right, 'reviewedAt'));

      setRequests(pending);
      setHistory(resolved);
    } catch (error) {
      setErrorMessage(error?.response?.data?.message || 'No se pudieron cargar las autorizaciones pendientes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const onApprove = async (item) => {
    setActionLoading(`approve:${item._id}`);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const response = item.actionType === 'adjust_charge_amount'
        ? await approveChargeAdjustmentRequest(item._id)
        : await approveEnrollmentMatriculaPurgeRequest(item._id);
      setSuccessMessage(response.data?.message || 'Solicitud autorizada.');
      await loadRequests();
      onUpdated?.();
    } catch (error) {
      setErrorMessage(error?.response?.data?.message || 'No se pudo autorizar la solicitud.');
    } finally {
      setActionLoading('');
    }
  };

  const onReject = async (item) => {
    const confirmed = window.confirm('¿Rechazar esta solicitud?');
    if (!confirmed) return;

    setActionLoading(`reject:${item._id}`);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const response = item.actionType === 'adjust_charge_amount'
        ? await rejectChargeAdjustmentRequest(item._id)
        : await rejectEnrollmentMatriculaPurgeRequest(item._id);
      setSuccessMessage(response.data?.message || 'Solicitud rechazada.');
      await loadRequests();
      onUpdated?.();
    } catch (error) {
      setErrorMessage(error?.response?.data?.message || 'No se pudo rechazar la solicitud.');
    } finally {
      setActionLoading('');
    }
  };

  return (
    <div className="enrollment-matricula-rectoria">
      {errorMessage ? <div className="matricula-flow-error">{errorMessage}</div> : null}
      {successMessage ? <div className="enrollment-matricula-rectoria__success">{successMessage}</div> : null}
      {loading ? <p>Cargando autorizaciones pendientes...</p> : null}

      {!loading ? (
        <>
          <section className="enrollment-matricula-rectoria__section">
            <div className="enrollment-matricula-rectoria__section-head">
              <div>
                <h3>Solicitudes pendientes</h3>
                <p>Autoriza o rechaza borrados, anulaciones de pagos y ajustes de valor solicitados desde cartera.</p>
              </div>
            </div>

            <div className="enrollment-matricula-rectoria__table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Solicitud</th>
                    <th>Solicitante</th>
                    <th>Detalle</th>
                    <th>Motivo</th>
                    <th>Fecha</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.length ? requests.map((item) => (
                    <tr key={`${item.actionType || 'request'}-${item._id}`}>
                      <td>{item.actionLabel || item.actionType}</td>
                      <td>
                        <div className="enrollment-matricula-rectoria__evidence">
                          <span>{item.requestedByName || '—'}</span>
                          <span>{item.requestedByRole || '—'}</span>
                        </div>
                      </td>
                      <td>{resolveRequestDetail(item)}</td>
                      <td>{resolveRequestMotive(item)}</td>
                      <td>{formatDateTime(item.submittedAt)}</td>
                      <td>
                        <div className="enrollment-matricula-rectoria__actions">
                          <button
                            className="enrollment-matricula-rectoria__action"
                            disabled={Boolean(actionLoading)}
                            onClick={() => onApprove(item)}
                            type="button"
                          >
                            {actionLoading === `approve:${item._id}` ? 'Autorizando...' : 'Autorizar'}
                          </button>
                          <button
                            className="enrollment-matricula-rectoria__action enrollment-matricula-rectoria__action--danger"
                            disabled={Boolean(actionLoading)}
                            onClick={() => onReject(item)}
                            type="button"
                          >
                            {actionLoading === `reject:${item._id}` ? 'Rechazando...' : 'Rechazar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={6}>No hay autorizaciones pendientes.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="enrollment-matricula-rectoria__section">
            <div className="enrollment-matricula-rectoria__section-head">
              <div>
                <h3>Historial de solicitudes</h3>
                <p>Quedan registradas las solicitudes aprobadas o rechazadas.</p>
              </div>
            </div>

            <div className="enrollment-matricula-rectoria__table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Solicitud</th>
                    <th>Solicitante</th>
                    <th>Detalle</th>
                    <th>Motivo</th>
                    <th>Estado</th>
                    <th>Revisado por</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {history.length ? history.map((item) => (
                    <tr key={`history-${item.actionType || 'request'}-${item._id}`}>
                      <td>{item.actionLabel || item.actionType}</td>
                      <td>
                        <div className="enrollment-matricula-rectoria__evidence">
                          <span>{item.requestedByName || '—'}</span>
                          <span>{item.requestedByRole || '—'}</span>
                        </div>
                      </td>
                      <td>{resolveRequestDetail(item)}</td>
                      <td>{resolveRequestMotive(item)}</td>
                      <td>
                        <span className={`enrollment-matricula-rectoria__status is-${item.status || 'unknown'}`}>
                          {resolveStatusLabel(item.status)}
                        </span>
                      </td>
                      <td>{item.reviewedByName || '—'}</td>
                      <td>{formatDateTime(item.reviewedAt || item.submittedAt)}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={7}>Todavía no hay solicitudes en el historial.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

export default EnrollmentMatriculaAuthorizationsPanel;
