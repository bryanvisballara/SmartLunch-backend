import { useCallback, useEffect, useState } from 'react';
import {
  approveEnrollmentMatriculaPurgeRequest,
  getEnrollmentMatriculaPurgeRequestsPending,
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

function EnrollmentMatriculaAuthorizationsPanel({ onUpdated }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const response = await getEnrollmentMatriculaPurgeRequestsPending();
      setRequests(response.data?.items || []);
    } catch (error) {
      setErrorMessage(error?.response?.data?.message || 'No se pudieron cargar las autorizaciones pendientes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const onApprove = async (requestId) => {
    setActionLoading(`approve:${requestId}`);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const response = await approveEnrollmentMatriculaPurgeRequest(requestId);
      setSuccessMessage(response.data?.message || 'Solicitud autorizada.');
      await loadRequests();
      onUpdated?.();
    } catch (error) {
      setErrorMessage(error?.response?.data?.message || 'No se pudo autorizar la solicitud.');
    } finally {
      setActionLoading('');
    }
  };

  const onReject = async (requestId) => {
    const confirmed = window.confirm('¿Rechazar esta solicitud de borrado?');
    if (!confirmed) return;

    setActionLoading(`reject:${requestId}`);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const response = await rejectEnrollmentMatriculaPurgeRequest(requestId);
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
        <section className="enrollment-matricula-rectoria__section">
          <div className="enrollment-matricula-rectoria__section-head">
            <div>
              <h3>Solicitudes pendientes</h3>
              <p>Autoriza o rechaza los borrados de consentimientos y documentos firmados solicitados desde cartera.</p>
            </div>
          </div>

          <div className="enrollment-matricula-rectoria__table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Solicitud</th>
                  <th>Solicitante</th>
                  <th>Registros</th>
                  <th>Fecha</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {requests.length ? requests.map((item) => (
                  <tr key={item._id}>
                    <td>{item.actionLabel || item.actionType}</td>
                    <td>
                      <div className="enrollment-matricula-rectoria__evidence">
                        <span>{item.requestedByName || '—'}</span>
                        <span>{item.requestedByRole || '—'}</span>
                      </div>
                    </td>
                    <td>{item.recordCount || 0}</td>
                    <td>{formatDateTime(item.submittedAt)}</td>
                    <td>
                      <div className="enrollment-matricula-rectoria__actions">
                        <button
                          className="enrollment-matricula-rectoria__action"
                          disabled={Boolean(actionLoading)}
                          onClick={() => onApprove(item._id)}
                          type="button"
                        >
                          {actionLoading === `approve:${item._id}` ? 'Autorizando...' : 'Autorizar'}
                        </button>
                        <button
                          className="enrollment-matricula-rectoria__action enrollment-matricula-rectoria__action--danger"
                          disabled={Boolean(actionLoading)}
                          onClick={() => onReject(item._id)}
                          type="button"
                        >
                          {actionLoading === `reject:${item._id}` ? 'Rechazando...' : 'Rechazar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={5}>No hay autorizaciones pendientes.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default EnrollmentMatriculaAuthorizationsPanel;
