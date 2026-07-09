import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createEnrollmentMatriculaPurgeRequest,
  downloadRectoriaEnrollmentDocument,
  downloadRectoriaEnrollmentDocumentsZip,
  getEnrollmentMatriculaPurgeRequestsMine,
  getRectoriaEnrollmentConsents,
  getRectoriaEnrollmentSignatures,
} from '../../services/enrollmentMatricula.service';
import './MatriculaEnrollmentFlow.css';

function formatDateTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatEnrollmentMatriculaConsentStatus(item = {}) {
  if (item?.statusLabel) return item.statusLabel;

  if (item?.status === 'office_payment_confirmed') {
    const methodLabels = {
      cash: 'Pago en efectivo',
      bank_transfer: 'Pago por transferencia',
      card: 'Pago con datáfono',
      pse: 'Pago por PSE',
      epayco: 'Pago por ePayco',
      bold: 'Pago por Bold',
      other: 'Pago registrado en cartera',
    };
    return methodLabels[String(item?.payment?.method || '').toLowerCase()] || 'Pago registrado en cartera';
  }

  const labels = {
    intro_pending: 'Introducción pendiente',
    consent_pending: 'Consentimiento pendiente',
    consent_accepted: 'Consentimiento aceptado',
    payment_pending: 'Pago pendiente',
    payment_confirmed: 'Pago confirmado',
    contract_pending: 'Firma de contrato pendiente',
    pagare_pending: 'Firma de pagaré pendiente',
    completed: 'Matrícula completada',
    cancelled: 'Cancelado',
  };

  return labels[item?.status] || item?.status || '—';
}

function downloadBlob(blob, fileName) {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.URL.revokeObjectURL(url);
}

function EnrollmentMatriculaRectoriaPanel() {
  const [activeTab, setActiveTab] = useState('consents');
  const [consents, setConsents] = useState([]);
  const [signatures, setSignatures] = useState([]);
  const [myRequests, setMyRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const [consentsResponse, signaturesResponse, requestsResponse] = await Promise.all([
        getRectoriaEnrollmentConsents(),
        getRectoriaEnrollmentSignatures(),
        getEnrollmentMatriculaPurgeRequestsMine(),
      ]);
      setConsents(consentsResponse.data?.items || []);
      setSignatures(signaturesResponse.data?.items || []);
      setMyRequests(requestsResponse.data?.items || []);
    } catch (error) {
      setErrorMessage(error?.response?.data?.message || 'No se pudieron cargar los registros de matrícula.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const pendingConsentRequest = useMemo(
    () => myRequests.find((item) => item.actionType === 'clear_consents' && item.status === 'pending'),
    [myRequests]
  );
  const pendingConsentRequestByProcessId = useMemo(() => {
    const map = new Map();
    myRequests.forEach((item) => {
      if (item.actionType === 'clear_consent' && item.status === 'pending' && item.processId) {
        map.set(String(item.processId), item);
      }
    });
    return map;
  }, [myRequests]);
  const pendingSignatureRequest = useMemo(
    () => myRequests.find((item) => item.actionType === 'clear_signatures' && item.status === 'pending'),
    [myRequests]
  );

  const onDownload = async (processId, documentType, fileName) => {
    try {
      const response = await downloadRectoriaEnrollmentDocument(processId, documentType);
      downloadBlob(response.data, fileName || `${documentType}.pdf`);
    } catch (error) {
      setErrorMessage(error?.response?.data?.message || 'No se pudo descargar el documento.');
    }
  };

  const onDownloadZip = async () => {
    setActionLoading('zip');
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const response = await downloadRectoriaEnrollmentDocumentsZip();
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(response.data, `documentos-firmados-matricula-${stamp}.zip`);
      setSuccessMessage('ZIP de documentos firmados descargado correctamente.');
    } catch (error) {
      setErrorMessage(error?.response?.data?.message || 'No se pudo generar el archivo ZIP.');
    } finally {
      setActionLoading('');
    }
  };

  const onRequestPurge = async (actionType, processId = '') => {
    setActionLoading(processId ? `clear_consent:${processId}` : actionType);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const payload = processId
        ? { actionType: 'clear_consent', processId }
        : { actionType };
      const response = await createEnrollmentMatriculaPurgeRequest(payload);
      setSuccessMessage(response.data?.message || 'Solicitud enviada a Rectoría.');
      await loadRecords();
    } catch (error) {
      setErrorMessage(error?.response?.data?.message || 'No se pudo enviar la solicitud.');
    } finally {
      setActionLoading('');
    }
  };

  const signaturesWithPdf = signatures.filter(
    (item) => item.contract?.signedPdfBase64 || item.pagare?.signedPdfBase64
  );

  return (
    <div className="enrollment-matricula-rectoria">
      <div className="enrollment-matricula-rectoria__tabs">
        <button
          className={`enrollment-matricula-rectoria__tab${activeTab === 'consents' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('consents')}
          type="button"
        >
          Consentimientos ({consents.length})
        </button>
        <button
          className={`enrollment-matricula-rectoria__tab${activeTab === 'signatures' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('signatures')}
          type="button"
        >
          Documentos firmados ({signatures.length})
        </button>
      </div>

      {errorMessage ? <div className="matricula-flow-error">{errorMessage}</div> : null}
      {successMessage ? <div className="enrollment-matricula-rectoria__success">{successMessage}</div> : null}
      {loading ? <p>Cargando registros de matrícula digital...</p> : null}

      {!loading && activeTab === 'consents' ? (
        <section className="enrollment-matricula-rectoria__section">
          <div className="enrollment-matricula-rectoria__section-head">
            <div>
              <h3>Consentimientos previos de matrícula</h3>
              <p>Registro de acudientes que aceptaron el consentimiento previo antes del pago.</p>
              {pendingConsentRequest ? (
                <p className="enrollment-matricula-rectoria__pending-note">
                  Solicitud pendiente en Rectoría desde {formatDateTime(pendingConsentRequest.submittedAt)}.
                </p>
              ) : null}
            </div>
            <button
              className="enrollment-matricula-rectoria__action enrollment-matricula-rectoria__action--danger"
              disabled={!consents.length || Boolean(pendingConsentRequest) || actionLoading === 'clear_consents'}
              onClick={() => onRequestPurge('clear_consents')}
              type="button"
            >
              {actionLoading === 'clear_consents' ? 'Enviando...' : 'Solicitar borrado masivo'}
            </button>
          </div>
          <div className="enrollment-matricula-rectoria__table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Estudiante</th>
                  <th>Acudiente</th>
                  <th>Fecha y hora</th>
                  <th>Evidencia</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {consents.length ? consents.map((item) => {
                  const pendingIndividual = pendingConsentRequestByProcessId.get(String(item._id));
                  const isSubmitting = actionLoading === `clear_consent:${item._id}`;

                  return (
                  <tr key={item._id}>
                    <td>{item.studentName || '—'}</td>
                    <td>{item.parentName || '—'}</td>
                    <td>{formatDateTime(item.consent?.acceptedAt)}</td>
                    <td>
                      <div className="enrollment-matricula-rectoria__evidence">
                        <span>Versión: {item.consent?.version || '—'}</span>
                        <span>IP: {item.consent?.ipAddress || '—'}</span>
                        <span>Dispositivo: {item.consent?.device || '—'}</span>
                      </div>
                    </td>
                    <td>{formatEnrollmentMatriculaConsentStatus(item)}</td>
                    <td>
                      {pendingIndividual ? (
                        <span className="enrollment-matricula-rectoria__pending-note">
                          Pendiente desde {formatDateTime(pendingIndividual.submittedAt)}
                        </span>
                      ) : (
                        <button
                          className="enrollment-matricula-rectoria__action enrollment-matricula-rectoria__action--danger"
                          disabled={Boolean(isSubmitting)}
                          onClick={() => onRequestPurge('clear_consent', item._id)}
                          type="button"
                        >
                          {isSubmitting ? 'Enviando...' : 'Solicitar borrado'}
                        </button>
                      )}
                    </td>
                  </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={6}>Aún no hay consentimientos registrados.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {!loading && activeTab === 'signatures' ? (
        <section className="enrollment-matricula-rectoria__section">
          <div className="enrollment-matricula-rectoria__section-head">
            <div>
              <h3>Contratos y pagarés firmados</h3>
              <p>Documentos firmados digitalmente por los acudientes después del pago.</p>
              {pendingSignatureRequest ? (
                <p className="enrollment-matricula-rectoria__pending-note">
                  Solicitud pendiente en Rectoría desde {formatDateTime(pendingSignatureRequest.submittedAt)}.
                </p>
              ) : null}
            </div>
            <div className="enrollment-matricula-rectoria__actions">
              <button
                className="enrollment-matricula-rectoria__action"
                disabled={!signaturesWithPdf.length || actionLoading === 'zip'}
                onClick={onDownloadZip}
                type="button"
              >
                {actionLoading === 'zip' ? 'Generando ZIP...' : 'Descargar ZIP'}
              </button>
              <button
                className="enrollment-matricula-rectoria__action enrollment-matricula-rectoria__action--danger"
                disabled={!signatures.length || Boolean(pendingSignatureRequest) || actionLoading === 'clear_signatures'}
                onClick={() => onRequestPurge('clear_signatures')}
                type="button"
              >
                {actionLoading === 'clear_signatures' ? 'Enviando...' : 'Solicitar borrado a Rectoría'}
              </button>
            </div>
          </div>
          <div className="enrollment-matricula-rectoria__table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Estudiante</th>
                  <th>Acudiente</th>
                  <th>Contrato</th>
                  <th>Pagaré</th>
                  <th>Pago</th>
                </tr>
              </thead>
              <tbody>
                {signatures.length ? signatures.map((item) => (
                  <tr key={item._id}>
                    <td>{item.studentName || '—'}</td>
                    <td>{item.parentName || '—'}</td>
                    <td>
                      {item.contract?.signedAt ? (
                        <div className="enrollment-matricula-rectoria__evidence">
                          <span>{formatDateTime(item.contract.signedAt)}</span>
                          {item.contract?.signedPdfBase64 ? (
                            <button
                              className="enrollment-matricula-rectoria__download"
                              onClick={() => onDownload(item._id, 'contract', item.contract?.fileName)}
                              type="button"
                            >
                              Descargar
                            </button>
                          ) : (
                            <span>Contrato físico en oficina</span>
                          )}
                        </div>
                      ) : 'Pendiente'}
                    </td>
                    <td>
                      {item.pagare?.signedAt ? (
                        <div className="enrollment-matricula-rectoria__evidence">
                          <span>{formatDateTime(item.pagare.signedAt)}</span>
                          {item.pagare?.signedPdfBase64 ? (
                            <button
                              className="enrollment-matricula-rectoria__download"
                              onClick={() => onDownload(item._id, 'pagare', item.pagare?.fileName)}
                              type="button"
                            >
                              Descargar
                            </button>
                          ) : (
                            <span>Pagaré físico en oficina</span>
                          )}
                        </div>
                      ) : 'Pendiente'}
                    </td>
                    <td>
                      <div className="enrollment-matricula-rectoria__evidence">
                        <span>{item.payment?.status || '—'}</span>
                        <span>{formatDateTime(item.payment?.paidAt)}</span>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={5}>Aún no hay documentos firmados.</td>
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

export default EnrollmentMatriculaRectoriaPanel;
