import { useEffect, useState } from 'react';
import { resolveApiAssetUrl } from '../../lib/api';
import {
  discardInformaDraft,
  generateInformaDraft,
  getInformaDrafts,
  publishInformaDraft,
} from '../../services/informa.service';
import './InformaDraftsPanel.css';

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function InformaDraftsPanel() {
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [pendingId, setPendingId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await getInformaDrafts();
      setDrafts(Array.isArray(response.data?.drafts) ? response.data.drafts : []);
    } catch (loadError) {
      setError(loadError?.response?.data?.message || loadError.message || 'No se pudieron cargar los borradores.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const onGenerate = async () => {
    setGenerating(true);
    setError('');
    setNotice('');
    try {
      const response = await generateInformaDraft();
      if (response.data?.draft) {
        setDrafts((current) => [response.data.draft, ...current.filter((item) => item.id !== response.data.draft.id)]);
        setNotice('Borrador generado. Revísalo y publícalo cuando quieras.');
      }
    } catch (generateError) {
      setError(generateError?.response?.data?.message || generateError.message || 'No se pudo generar el borrador.');
    } finally {
      setGenerating(false);
    }
  };

  const onPublish = async (draftId) => {
    setPendingId(draftId);
    setError('');
    setNotice('');
    try {
      await publishInformaDraft(draftId);
      setDrafts((current) => current.filter((item) => item.id !== draftId));
      setNotice('Publicación enviada al feed de Comergio Informa.');
    } catch (publishError) {
      setError(publishError?.response?.data?.message || publishError.message || 'No se pudo publicar.');
    } finally {
      setPendingId('');
    }
  };

  const onDiscard = async (draftId) => {
    if (!window.confirm('¿Descartar este borrador?')) return;
    setPendingId(draftId);
    setError('');
    try {
      await discardInformaDraft(draftId);
      setDrafts((current) => current.filter((item) => item.id !== draftId));
      setNotice('Borrador descartado.');
    } catch (discardError) {
      setError(discardError?.response?.data?.message || discardError.message || 'No se pudo descartar.');
    } finally {
      setPendingId('');
    }
  };

  return (
    <section className="informa-drafts">
      <div className="informa-drafts__head">
        <div>
          <span className="informa-drafts__kicker">Borradores automáticos</span>
          <h4>Cola de revisión</h4>
          <p>Cada día a las 7:00 y 12:00 (Colombia) se genera 1 noticia. Tú decides cuándo publicar.</p>
        </div>
        <button className="informa-drafts__generate" disabled={generating} onClick={onGenerate} type="button">
          {generating ? 'Generando...' : 'Generar ahora'}
        </button>
      </div>

      {notice ? <div className="informa-drafts__banner is-success">{notice}</div> : null}
      {error ? <div className="informa-drafts__banner is-error">{error}</div> : null}

      {loading ? <p className="informa-drafts__muted">Cargando borradores...</p> : null}

      {!loading && drafts.length === 0 ? (
        <div className="informa-drafts__empty">
          <p>No hay borradores pendientes.</p>
          <span>Puedes generar uno manualmente o esperar al próximo horario automático.</span>
        </div>
      ) : null}

      <div className="informa-drafts__list">
        {drafts.map((draft) => {
          const cover = draft.media?.[0]?.src || '';
          const busy = pendingId === draft.id;
          return (
            <article className="informa-drafts__card" key={draft.id}>
              <div className="informa-drafts__media">
                {cover ? (
                  <img alt="" src={resolveApiAssetUrl(cover)} />
                ) : (
                  <span>Sin imagen</span>
                )}
              </div>
              <div className="informa-drafts__copy">
                <div className="informa-drafts__meta">
                  <strong>{draft.source?.topic || 'Novedad'}</strong>
                  <span>{formatDate(draft.auto?.generatedAt || draft.createdAt)}</span>
                </div>
                <h5>{draft.title}</h5>
                <p>{draft.body}</p>
                {draft.source?.url ? (
                  <a href={draft.source.url} rel="noreferrer" target="_blank">
                    Ver fuente original
                  </a>
                ) : null}
                <div className="informa-drafts__actions">
                  <button
                    className="informa-drafts__publish"
                    disabled={busy}
                    onClick={() => onPublish(draft.id)}
                    type="button"
                  >
                    {busy ? 'Publicando...' : 'Publicar'}
                  </button>
                  <button
                    className="informa-drafts__discard"
                    disabled={busy}
                    onClick={() => onDiscard(draft.id)}
                    type="button"
                  >
                    Descartar
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
