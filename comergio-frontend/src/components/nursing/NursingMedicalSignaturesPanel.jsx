import { useEffect, useState } from 'react';
import { getNursingMedicalProfileSignatures } from '../../services/nursing.service';

function formatDateTime(value) {
  if (!value) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default function NursingMedicalSignaturesPanel({ className = '' }) {
  const [signatures, setSignatures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState('');

  const loadSignatures = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await getNursingMedicalProfileSignatures({ limit: 80 });
      const rows = response.data?.signatures || [];
      setSignatures(rows);
      if (rows.length && !rows.some((row) => row.studentId === selectedId)) {
        setSelectedId(rows[0].studentId);
      }
      if (!rows.length) {
        setSelectedId('');
      }
    } catch (requestError) {
      setSignatures([]);
      setSelectedId('');
      setError(requestError?.response?.data?.message || 'No se pudieron cargar las firmas de fichas médicas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSignatures();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = signatures.find((row) => row.studentId === selectedId) || null;

  return (
    <section className={`nursing-panel nursing-signatures-panel${className ? ` ${className}` : ''}`}>
      <header className="nursing-panel-head nursing-signatures-panel__head">
        <div>
          <span className="nursing-kicker">Autorización familiar</span>
          <h2>Firmas de fichas médicas</h2>
          <p>Firmas de acudientes que confirman la información clínica del alumno.</p>
        </div>
        <button className="nursing-secondary-btn" disabled={loading} onClick={loadSignatures} type="button">
          {loading ? 'Actualizando...' : 'Actualizar'}
        </button>
      </header>

      {error ? <p className="nursing-notice error">{error}</p> : null}
      {loading ? <p className="nursing-empty">Cargando firmas...</p> : null}

      {!loading && signatures.length === 0 ? (
        <div className="nursing-section-empty">
          <strong>Aún no hay fichas firmadas</strong>
          <p>Cuando un acudiente firme la ficha médica desde la app, aparecerá aquí.</p>
        </div>
      ) : null}

      {!loading && signatures.length > 0 ? (
        <div className="nursing-signatures-layout">
          <aside className="nursing-signatures-list">
            {signatures.map((row) => (
              <button
                className={`nursing-signatures-list__item${row.studentId === selectedId ? ' is-selected' : ''}`}
                key={row.studentId}
                onClick={() => setSelectedId(row.studentId)}
                type="button"
              >
                <strong>{row.studentName}</strong>
                <small>{[row.displayGrade || row.grade, row.schoolCode].filter(Boolean).join(' · ') || 'Sin curso'}</small>
                <em>{formatDateTime(row.signedAt)}</em>
              </button>
            ))}
          </aside>

          {selected ? (
            <article className="nursing-signatures-detail">
              <header>
                <div>
                  <span className="nursing-kicker">Firma registrada</span>
                  <h3>{selected.studentName}</h3>
                  <p>
                    {[selected.displayGrade || selected.grade, selected.schoolCode].filter(Boolean).join(' · ') || 'Sin curso'}
                    {selected.bloodType ? ` · Sangre ${selected.bloodType}` : ''}
                  </p>
                </div>
              </header>
              <dl className="nursing-signatures-meta">
                <div>
                  <dt>Firmó</dt>
                  <dd>{selected.signedByParentName || 'Acudiente'}</dd>
                </div>
                <div>
                  <dt>Fecha</dt>
                  <dd>{formatDateTime(selected.signedAt)}</dd>
                </div>
              </dl>
              {selected.signatureImage ? (
                <img
                  alt={`Firma de ficha médica de ${selected.studentName}`}
                  className="nursing-signatures-detail__image"
                  src={selected.signatureImage}
                />
              ) : (
                <p className="nursing-empty">Sin imagen de firma disponible.</p>
              )}
            </article>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
