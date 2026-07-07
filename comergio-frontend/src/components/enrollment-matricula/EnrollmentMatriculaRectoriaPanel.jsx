import { useCallback, useEffect, useState } from 'react';
import {
  deleteAllRectoriaEnrollmentConsents,
  deleteAllRectoriaEnrollmentSignatures,
  downloadRectoriaEnrollmentDocument,
  downloadRectoriaEnrollmentDocumentsZip,
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

function createAuthorizationModalState() {
  return {
    open: false,
    action: '',
    password: '',
    error: '',
  };
}

function EnrollmentMatriculaRectoriaPanel() {
  const [activeTab, setActiveTab] = useState('consents');
  const [consents, setConsents] = useState([]);
  const [signatures, setSignatures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [authorizationModal, setAuthorizationModal] = useState(createAuthorizationModalState);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const [consentsResponse, signaturesResponse] = await Promise.all([
        getRectoriaEnrollmentConsents(),
        getRectoriaEnrollmentSignatures(),
      ]);
      setConsents(consentsResponse.data?.items || []);
      setSignatures(signaturesResponse.data?.items || []);
    } catch (error) {
      setErrorMessage(error?.response?.data?.message || 'No se pudieron cargar los registros de matrícula.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

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

  const openAuthorizationModal = (action) => {
    setErrorMessage('');
    setSuccessMessage('');
    setAuthorizationModal({
      open: true,
      action,
      password: '',
      error: '',
    });
  };

  const closeAuthorizationModal = () => {
    if (actionLoading) return;
    setAuthorizationModal(createAuthorizationModalState());
  };

  const onSubmitAuthorization = async (event) => {
    event.preventDefault();

    const action = authorizationModal.action;
    const rectoriaPassword = String(authorizationModal.password || '').trim();
    if (!rectoriaPassword) {
      setAuthorizationModal((previous) => ({
        ...previous,
        error: 'Debes ingresar la clave de autorización de Rectoría.',
      }));
      return;
    }

    setActionLoading(action);
    setAuthorizationModal((previous) => ({ ...previous, error: '' }));
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const response = action === 'consents'
        ? await deleteAllRectoriaEnrollmentConsents({ rectoriaPassword })
        : await deleteAllRectoriaEnrollmentSignatures({ rectoriaPassword });

      const authorizedByName = response.data?.authorizedBy?.name;
      const baseMessage = response.data?.message || 'Registros eliminados correctamente.';
      setSuccessMessage(
        authorizedByName
          ? `${baseMessage} Autorizado por ${authorizedByName}.`
          : baseMessage
      );
      setAuthorizationModal(createAuthorizationModalState());
      await loadRecords();
    } catch (error) {
      const message = error?.response?.data?.message || 'No se pudo completar la eliminación.';
      setAuthorizationModal((previous) => ({
        ...previous,
        error: message,
      }));
    } finally {
      setActionLoading('');
    }
  };

  const onDeleteAllConsents = () => {
    if (!consents.length) return;
    openAuthorizationModal('consents');
  };

  const onDeleteAllSignatures = () => {
    if (!signatures.length) return;
    openAuthorizationModal('signatures');
  };

  const signaturesWithPdf = signatures.filter(
    (item) => item.contract?.signedPdfBase64 || item.pagare?.signedPdfBase64
  );

  const authorizationTitle = authorizationModal.action === 'consents'
    ? `¿Borrar ${consents.length} consentimiento(s)?`
    : `¿Borrar ${signatures.length} documento(s) firmado(s)?`;

  const authorizationMessage = authorizationModal.action === 'consents'
    ? 'Esta acción elimina todos los consentimientos registrados. Debes ingresar la clave de un usuario de Rectoría o Dirección para autorizarla.'
    : 'Esta acción elimina todos los contratos y pagarés firmados. Debes ingresar la clave de un usuario de Rectoría o Dirección para autorizarla.';

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
            </div>
            <button
              className="enrollment-matricula-rectoria__action enrollment-matricula-rectoria__action--danger"
              disabled={!consents.length || actionLoading === 'consents'}
              onClick={onDeleteAllConsents}
              type="button"
            >
              {actionLoading === 'consents' ? 'Eliminando...' : 'Borrar todos los consentimientos'}
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
                </tr>
              </thead>
              <tbody>
                {consents.length ? consents.map((item) => (
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
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={5}>Aún no hay consentimientos registrados.</td>
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
                disabled={!signatures.length || actionLoading === 'signatures'}
                onClick={onDeleteAllSignatures}
                type="button"
              >
                {actionLoading === 'signatures' ? 'Eliminando...' : 'Borrar todos los documentos'}
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

      {authorizationModal.open ? (
        <div className="enrollment-matricula-rectoria__modal-overlay" role="dialog" aria-modal="true">
          <form className="enrollment-matricula-rectoria__modal" onSubmit={onSubmitAuthorization}>
            <div className="enrollment-matricula-rectoria__modal-head">
              <span className="enrollment-matricula-rectoria__modal-eyebrow">Autorización de Rectoría</span>
              <h3>{authorizationTitle}</h3>
              <p>{authorizationMessage}</p>
            </div>

            {authorizationModal.error ? (
              <div className="matricula-flow-error">{authorizationModal.error}</div>
            ) : null}

            <label className="enrollment-matricula-rectoria__modal-label">
              Clave de autorización de Rectoría
              <input
                autoComplete="current-password"
                autoFocus
                onChange={(event) => setAuthorizationModal((previous) => ({
                  ...previous,
                  password: event.target.value,
                  error: '',
                }))}
                placeholder="Ingresa la clave de Rectoría o Dirección"
                type="password"
                value={authorizationModal.password}
              />
            </label>

            <div className="enrollment-matricula-rectoria__modal-actions">
              <button
                className="enrollment-matricula-rectoria__action"
                disabled={Boolean(actionLoading)}
                onClick={closeAuthorizationModal}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="enrollment-matricula-rectoria__action enrollment-matricula-rectoria__action--danger"
                disabled={Boolean(actionLoading) || !String(authorizationModal.password || '').trim()}
                type="submit"
              >
                {actionLoading ? 'Autorizando...' : 'Autorizar y borrar'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export default EnrollmentMatriculaRectoriaPanel;
