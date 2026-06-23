import { useEffect, useState } from 'react';
import {
  downloadRectoriaEnrollmentDocument,
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
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setErrorMessage('');
      try {
        const [consentsResponse, signaturesResponse] = await Promise.all([
          getRectoriaEnrollmentConsents(),
          getRectoriaEnrollmentSignatures(),
        ]);
        if (cancelled) return;
        setConsents(consentsResponse.data?.items || []);
        setSignatures(signaturesResponse.data?.items || []);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error?.response?.data?.message || 'No se pudieron cargar los registros de matrícula.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const onDownload = async (processId, documentType, fileName) => {
    try {
      const response = await downloadRectoriaEnrollmentDocument(processId, documentType);
      downloadBlob(response.data, fileName || `${documentType}.pdf`);
    } catch (error) {
      setErrorMessage(error?.response?.data?.message || 'No se pudo descargar el documento.');
    }
  };

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
      {loading ? <p>Cargando registros de matrícula digital...</p> : null}

      {!loading && activeTab === 'consents' ? (
        <section className="enrollment-matricula-rectoria__section">
          <h3>Consentimientos previos de matrícula</h3>
          <p>Registro de acudientes que aceptaron el consentimiento previo antes del pago.</p>
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
                    <td>{item.status}</td>
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
          <h3>Contratos y pagarés firmados</h3>
          <p>Documentos firmados digitalmente por los acudientes después del pago.</p>
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
                          <button
                            className="enrollment-matricula-rectoria__download"
                            onClick={() => onDownload(item._id, 'contract', item.contract?.fileName)}
                            type="button"
                          >
                            Descargar
                          </button>
                        </div>
                      ) : 'Pendiente'}
                    </td>
                    <td>
                      {item.pagare?.signedAt ? (
                        <div className="enrollment-matricula-rectoria__evidence">
                          <span>{formatDateTime(item.pagare.signedAt)}</span>
                          <button
                            className="enrollment-matricula-rectoria__download"
                            onClick={() => onDownload(item._id, 'pagare', item.pagare?.fileName)}
                            type="button"
                          >
                            Descargar
                          </button>
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
