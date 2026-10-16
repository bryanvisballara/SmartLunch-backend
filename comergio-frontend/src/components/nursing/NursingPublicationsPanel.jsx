import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import ClickableOptionPicker from '../audience/ClickableOptionPicker';
import {
  addAudienceListValue,
  buildPublicationAudienceCourseOptions,
  removeAudienceListValue,
} from '../../lib/publicationAudience';
import {
  formatFileSizeMb,
  MAX_TEACHER_FEED_MEDIA_BYTES,
  MAX_TEACHER_FEED_MEDIA_FILES,
  resolvePlayableFeedVideoUrl,
} from '../../lib/feedMedia';
import {
  createNursingParentFeedRequest,
  getNursingParentFeedRequests,
  getNursingPublicationAudiences,
  uploadNursingParentFeedMedia,
} from '../../services/nursing.service';
import '../../campus/campus.css';

const publicationStatusLabels = {
  pending: 'En revisión',
  approved: 'Aprobada',
  rejected: 'Rechazada',
};

function formatDateLabel(value) {
  if (!value) {
    return 'Sin fecha';
  }
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(new Date(value));
}

function getPublicationStatusTone(status) {
  if (status === 'approved') {
    return 'approved';
  }
  if (status === 'rejected') {
    return 'rejected';
  }
  return 'pending';
}

function getPublicationThumb(request) {
  const media = Array.isArray(request?.media) ? request.media : [];
  const first = media.find((item) => item?.thumbUrl || item?.src);
  return first?.thumbUrl || first?.src || '';
}

const emptyDraft = {
  title: '',
  body: '',
  audienceValues: [],
  media: [],
};

function NursingPublicationsPanel({ className = '', onNotice }) {
  const queryClient = useQueryClient();
  const mediaInputRef = useRef(null);
  const audienceRef = useRef(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [inlineError, setInlineError] = useState('');
  const [mediaUploading, setMediaUploading] = useState(false);
  const [mediaUploadProgress, setMediaUploadProgress] = useState(0);
  const [mediaDragActive, setMediaDragActive] = useState(false);

  const audiencesQuery = useQuery({
    queryKey: ['nursing', 'publications', 'audiences'],
    queryFn: getNursingPublicationAudiences,
  });

  const requestsQuery = useQuery({
    queryKey: ['nursing', 'parent-feed-requests'],
    queryFn: getNursingParentFeedRequests,
  });

  const audienceOptions = useMemo(() => {
    const payload = audiencesQuery.data || {};
    return buildPublicationAudienceCourseOptions({
      classroomGroups: payload.classroomGroups || [],
      courseOptions: payload.courseOptions || payload.audienceOptions || [],
    });
  }, [audiencesQuery.data]);

  const requests = requestsQuery.data || [];
  const recentRequests = requests.slice(0, 4);
  const bodyLength = String(draft.body || '').length;
  const hasAudience = (draft.audienceValues || []).length > 0;

  const createMutation = useMutation({
    mutationFn: createNursingParentFeedRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nursing', 'parent-feed-requests'] });
      setDraft(emptyDraft);
      setInlineError('');
      onNotice?.({ type: 'success', text: 'Publicación enviada a revisión. Secretaría Académica o rectoría la autorizarán antes de publicarla en la app de acudientes.' });
    },
    onError: (error) => {
      const text = error?.response?.data?.message || error?.message || 'No se pudo enviar la publicación.';
      setInlineError(text);
      onNotice?.({ type: 'error', text });
    },
  });

  const notifyError = (text) => {
    setInlineError(text);
    onNotice?.({ type: 'error', text });
  };

  const onAddAudience = (value) => {
    setDraft((current) => ({
      ...current,
      audienceValues: addAudienceListValue(current.audienceValues, value),
    }));
    setInlineError('');
  };

  const onRemoveAudience = (value) => {
    setDraft((current) => ({
      ...current,
      audienceValues: removeAudienceListValue(current.audienceValues, value),
    }));
  };

  const uploadSelectedMedia = async (selectedFiles) => {
    if (!selectedFiles.length) {
      return;
    }

    if ((draft.media || []).length + selectedFiles.length > MAX_TEACHER_FEED_MEDIA_FILES) {
      notifyError(`Puedes adjuntar hasta ${MAX_TEACHER_FEED_MEDIA_FILES} fotos o videos por publicación.`);
      return;
    }

    const oversizedFile = selectedFiles.find((file) => Number(file.size || 0) > MAX_TEACHER_FEED_MEDIA_BYTES);
    if (oversizedFile) {
      notifyError(
        `El archivo "${oversizedFile.name}" pesa ${formatFileSizeMb(oversizedFile.size)} MB. El máximo permitido es ${Math.round(MAX_TEACHER_FEED_MEDIA_BYTES / (1024 * 1024))} MB.`
      );
      return;
    }

    setMediaUploading(true);
    setMediaUploadProgress(0);
    try {
      const { media: uploadedMedia } = await uploadNursingParentFeedMedia(selectedFiles, {
        onProgress: (ratio) => setMediaUploadProgress(Math.round(ratio * 100)),
      });
      setDraft((current) => ({
        ...current,
        media: [...(current.media || []), ...(uploadedMedia || [])].slice(0, MAX_TEACHER_FEED_MEDIA_FILES),
      }));
    } catch (error) {
      notifyError(error?.response?.data?.message || error?.message || 'No se pudieron subir los archivos.');
    } finally {
      setMediaUploading(false);
      setMediaUploadProgress(0);
      if (mediaInputRef.current) {
        mediaInputRef.current.value = '';
      }
    }
  };

  const onMediaSelected = (event) => {
    const files = Array.from(event.target.files || []);
    uploadSelectedMedia(files);
  };

  const onMediaDrop = (event) => {
    event.preventDefault();
    setMediaDragActive(false);
    uploadSelectedMedia(Array.from(event.dataTransfer?.files || []));
  };

  const onRemoveMedia = (index) => {
    setDraft((current) => ({
      ...current,
      media: (current.media || []).filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    const title = String(draft.title || '').trim();
    const body = String(draft.body || '').trim();
    const media = Array.isArray(draft.media) ? draft.media : [];

    if (!hasAudience) {
      notifyError('Selecciona al menos un grupo o curso destinatario.');
      audienceRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      return;
    }

    if (!title || !body) {
      notifyError('Escribe un título y una descripción para enviar a revisión.');
      return;
    }

    setInlineError('');
    await createMutation.mutateAsync({
      title,
      body,
      audienceValues: draft.audienceValues,
      media,
      channels: { push: true, email: false },
    });
  };

  const selectedAudienceLabels = audienceOptions
    .filter((option) => (draft.audienceValues || []).includes(option.value))
    .map((option) => option.label)
    .join(', ');

  const panelClass = ['campus-teacher__publications-panel', 'campus-teacher__embedded-panel', className].filter(Boolean).join(' ');

  return (
    <article className={panelClass}>
      <header className="campus-teacher__publications-hero">
        <div>
          <span className="campus-teacher__publications-kicker">Publicaciones</span>
          <h2>Enviar publicación</h2>
          <p>Comparte fotos, videos y mensajes con las familias. El flujo es el mismo que en el portal docente: revisión institucional y luego publicación en la app de acudientes.</p>
        </div>
        <button
          className="campus-teacher__publications-history-btn"
          onClick={() => document.getElementById('nursing-publications-history')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })}
          type="button"
        >
          Ver historial
        </button>
      </header>

      <div className="campus-teacher__publications-layout">
        <form className="campus-teacher__publications-card" onSubmit={onSubmit}>
          <div className="campus-teacher__publications-card-head">
            <div>
              <h3>Detalles de la publicación</h3>
              <p>Área: Enfermería · Rectoría, coordinación, dirección o secretaría académica revisan antes de publicar.</p>
            </div>
            <button
              className="campus-teacher__publications-refresh"
              disabled={requestsQuery.isFetching}
              onClick={() => requestsQuery.refetch()}
              type="button"
            >
              <span aria-hidden="true" className={requestsQuery.isFetching ? 'is-spinning' : ''}>↻</span>
              Actualizar
            </button>
          </div>

          <div
            className={`campus-teacher__publications-field is-wide${inlineError && !hasAudience ? ' is-invalid' : ''}`}
            ref={audienceRef}
          >
            <span>Cursos o grupos destinatarios</span>
            {audiencesQuery.isLoading ? (
              <p className="campus-panel__meta">Cargando cursos del colegio...</p>
            ) : (
              <ClickableOptionPicker
                emptyLabel="Toca un grupo o curso de la lista para enviarlo a revisión."
                onAdd={onAddAudience}
                onRemove={onRemoveAudience}
                options={audienceOptions}
                selectedValues={draft.audienceValues || []}
              />
            )}
          </div>

          <label className="campus-teacher__publications-field is-wide">
            <span>Título</span>
            <div className="campus-teacher__publications-input-shell">
              <input
                placeholder="Ej. Jornada de vacunación en el colegio"
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              />
            </div>
          </label>

          <label className="campus-teacher__publications-field is-wide">
            <span>Descripción</span>
            <div className="campus-teacher__publications-editor">
              <textarea
                maxLength={1000}
                placeholder="Explica el contenido y por qué es relevante para las familias."
                rows={6}
                value={draft.body}
                onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value.slice(0, 1000) }))}
              />
              <em>{bodyLength} / 1000</em>
            </div>
          </label>

          <div className="campus-teacher__publications-field is-wide">
            <span>Fotos o videos</span>
            <button
              className={`campus-teacher__publications-dropzone${mediaDragActive ? ' is-dragging' : ''}${mediaUploading ? ' is-uploading' : ''}`}
              disabled={mediaUploading || (draft.media || []).length >= MAX_TEACHER_FEED_MEDIA_FILES}
              onClick={() => mediaInputRef.current?.click()}
              onDragEnter={(event) => {
                event.preventDefault();
                setMediaDragActive(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  setMediaDragActive(false);
                }
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={onMediaDrop}
              type="button"
            >
              <strong>
                {mediaUploading
                  ? `Subiendo archivo${mediaUploadProgress ? `… ${mediaUploadProgress}%` : '…'}`
                  : 'Arrastra archivos aquí o selecciona'}
              </strong>
              <span>JPG, PNG, MP4 o MOV hasta 100 MB c/u · Máximo {MAX_TEACHER_FEED_MEDIA_FILES} archivos</span>
            </button>
            <input
              accept="image/*,video/*"
              disabled={mediaUploading || (draft.media || []).length >= MAX_TEACHER_FEED_MEDIA_FILES}
              hidden
              multiple
              onChange={onMediaSelected}
              ref={mediaInputRef}
              type="file"
            />

            {(draft.media || []).length > 0 ? (
              <div className="campus-teacher__publications-media-grid">
                {(draft.media || []).map((item, index) => (
                  <article className="campus-teacher__publications-media-card" key={`${item.kind}-${item.src}-${index}`}>
                    <div className="campus-teacher__publications-media-preview">
                      {item.kind === 'video'
                        ? <video controls playsInline src={resolvePlayableFeedVideoUrl(item.src)} />
                        : <img alt={item.alt || `Adjunto ${index + 1}`} src={item.thumbUrl || item.src} />}
                    </div>
                    <button onClick={() => onRemoveMedia(index)} type="button">Quitar</button>
                  </article>
                ))}
              </div>
            ) : null}
          </div>

          <div className="campus-teacher__publications-footer">
            <div className="campus-teacher__publications-summary">
              <span>
                {selectedAudienceLabels
                  ? `Enfermería · ${selectedAudienceLabels}`
                  : 'Selecciona al menos un curso o grupo para continuar.'}
              </span>
            </div>
            {inlineError ? (
              <p className="campus-teacher__publications-inline-error">{inlineError}</p>
            ) : null}
            <button
              className="campus-teacher__action-btn campus-teacher__publications-submit"
              disabled={createMutation.isPending || mediaUploading}
              type="submit"
            >
              {createMutation.isPending ? 'Enviando...' : 'Enviar a revisión'}
            </button>
          </div>
        </form>

        <aside className="campus-teacher__publications-sidebar">
          <section className="campus-teacher__publications-side-card">
            <div className="campus-teacher__publications-side-head">
              <h3>Publicaciones recientes</h3>
            </div>
            {requestsQuery.isLoading ? (
              <p className="campus-panel__meta">Cargando publicaciones...</p>
            ) : null}
            {!requestsQuery.isLoading && recentRequests.length === 0 ? (
              <p className="campus-panel__meta">Todavía no tienes publicaciones enviadas.</p>
            ) : null}
            <div className="campus-teacher__publications-recent-list">
              {recentRequests.map((request) => {
                const thumb = getPublicationThumb(request);
                const tone = getPublicationStatusTone(request.status);
                return (
                  <article className="campus-teacher__publications-recent-item" key={request._id}>
                    <div className={`campus-teacher__publications-recent-thumb${thumb ? '' : ' is-empty'}`}>
                      {thumb ? <img alt="" src={thumb} /> : <span aria-hidden="true">📷</span>}
                    </div>
                    <div>
                      <strong>{request.title || 'Sin título'}</strong>
                      <div className="campus-teacher__publications-recent-meta">
                        <span className={`campus-teacher__publications-status is-${tone}`}>
                          {publicationStatusLabels[request.status] || request.status}
                        </span>
                        <span>{formatDateLabel(request.submittedAt)}</span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </aside>
      </div>

      <section className="campus-teacher__publications-history" id="nursing-publications-history">
        <div className="campus-teacher__publications-history-head">
          <span className="campus-teacher__publications-kicker">Historial</span>
          <h3>Mis publicaciones</h3>
        </div>
        {requestsQuery.isLoading ? (
          <p className="campus-panel__meta">Cargando publicaciones...</p>
        ) : null}
        {requests.length === 0 && !requestsQuery.isLoading ? (
          <div className="campus-teacher__publications-history-empty">
            <strong>Aún no hay publicaciones enviadas</strong>
            <p>Cuando envíes una publicación a revisión, quedará aquí para seguimiento.</p>
          </div>
        ) : null}
        {requests.length > 0 ? (
          <div className="campus-teacher__publications-history-list">
            {requests.map((request) => {
              const tone = getPublicationStatusTone(request.status);
              return (
                <article className={`campus-teacher__publications-history-item status-${request.status}`} key={request._id}>
                  <div>
                    <span className={`campus-teacher__publications-status is-${tone}`}>
                      {publicationStatusLabels[request.status] || request.status}
                    </span>
                    <strong>{request.title}</strong>
                    <p>{request.body}</p>
                    {request.reviewNotes ? (
                      <p className="campus-panel__meta">Notas de revisión: {request.reviewNotes}</p>
                    ) : null}
                  </div>
                  <span>{formatDateLabel(request.submittedAt)}</span>
                </article>
              );
            })}
          </div>
        ) : null}
      </section>
    </article>
  );
}

export default NursingPublicationsPanel;
