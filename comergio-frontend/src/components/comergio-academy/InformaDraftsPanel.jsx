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
      const response = await generateInformaDraft({ clearExisting: true });
      if (response.data?.draft) {
        setDrafts([response.data.draft]);
        const imageNote = response.data?.imageModel && response.data.imageModel !== 'branded-fallback'
          ? ' Imagen generada con OpenAI.'
          : ' Imagen de respaldo (revisa OPENAI_API_KEY / OPENAI_IMAGE_MODEL).';
        setNotice(`Borrador listo para previsualizar.${imageNote}`);
      } else {
        setNotice(response.data?.reason || 'No se generó un borrador nuevo.');
        await refresh();
      }
    } catch (generateError) {
      const timedOut = /timeout|tardó demasiado|ECONNABORTED/i.test(String(generateError?.message || ''));
      setError(
        generateError?.response?.data?.message
        || (timedOut
          ? 'La generación con OpenAI tardó demasiado. Vuelve a intentar; suele tomar cerca de 1 minuto.'
          : (generateError.message || 'No se pudo generar el borrador.'))
      );
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
          <span className="informa-drafts__kicker">Cola de revisión</span>
          <h4>Previsualización de publicaciones</h4>
          <p>
            Genera una noticia con foto realista y título encima (estilo Instagram), lista para previsualizar.
            Al generar, se archivan los borradores anteriores.
          </p>
        </div>
        <div className="informa-drafts__head-actions">
          <button className="informa-drafts__refresh" disabled={loading || generating} onClick={refresh} type="button">
            Actualizar
          </button>
          <button className="informa-drafts__generate" disabled={generating} onClick={onGenerate} type="button">
            {generating ? 'Generando con OpenAI…' : 'Limpiar y generar'}
          </button>
        </div>
      </div>

      {generating ? (
        <div className="informa-drafts__progress" role="status">
          <span className="informa-drafts__spinner" aria-hidden="true" />
          <div>
            <strong>Creando publicación…</strong>
            <p>Buscando noticia, redactando título/texto y generando la imagen. Puede tomar hasta 1–2 minutos.</p>
          </div>
        </div>
      ) : null}

      {notice ? <div className="informa-drafts__banner is-success">{notice}</div> : null}
      {error ? <div className="informa-drafts__banner is-error">{error}</div> : null}

      {loading ? <p className="informa-drafts__muted">Cargando borradores...</p> : null}

      {!loading && !generating && drafts.length === 0 ? (
        <div className="informa-drafts__empty">
          <p>No hay borradores pendientes.</p>
          <span>Pulsa “Limpiar y generar” para crear una previsualización con imagen OpenAI.</span>
        </div>
      ) : null}

      <div className="informa-drafts__list">
        {drafts.map((draft) => {
          const cover = draft.media?.[0]?.src || draft.media?.[0]?.thumbUrl || '';
          const busy = pendingId === draft.id;
          return (
            <article className="informa-drafts__card" key={draft.id}>
              <div className="informa-drafts__media">
                {cover ? (
                  <img alt={draft.title || 'Portada Comergio Informa'} src={resolveApiAssetUrl(cover)} />
                ) : (
                  <span>Sin imagen</span>
                )}
              </div>
              <div className="informa-drafts__copy">
                <div className="informa-drafts__meta">
                  <strong>Previsualización</strong>
                  <span>{formatDate(draft.auto?.generatedAt || draft.createdAt)}</span>
                </div>
                <h5>{draft.title}</h5>
                <p>{draft.body}</p>
                {draft.auto?.model ? (
                  <small className="informa-drafts__model">Modelo: {draft.auto.model}</small>
                ) : null}
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
