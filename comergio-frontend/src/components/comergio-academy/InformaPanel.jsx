import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { resolveApiAssetUrl } from '../../lib/api';
import useAuthStore from '../../store/auth.store';
import {
  archiveInformaPost,
  commentInformaPost,
  createInformaPost,
  getInformaMeta,
  getInformaPosts,
  likeInformaComment,
  likeInformaPost,
  uploadInformaMedia,
} from '../../services/informa.service';
import './InformaPanel.css';

const INFORMA_AUTHOR_NAME = 'Comergio Informa';
const INFORMA_AUTHOR_PHOTO = '/informa/avatar-colibri.png';

const FEATURES = [
  {
    key: 'global',
    title: 'Información global',
    description: 'Lo más relevante del mundo.',
    tone: 'blue',
    icon: 'globe',
  },
  {
    key: 'ideas',
    title: 'Ideas que importan',
    description: 'Descubre tendencias e inspiración.',
    tone: 'orange',
    icon: 'bulb',
  },
  {
    key: 'grow',
    title: 'Aprende y crece',
    description: 'Conecta conocimiento con tu día a día.',
    tone: 'green',
    icon: 'chart',
  },
  {
    key: 'trust',
    title: 'Contenido confiable',
    description: 'Fuentes verificadas, sin ruido.',
    tone: 'purple',
    icon: 'heart',
  },
];

function formatRelativeDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}

function FeatureIcon({ icon }) {
  const common = {
    fill: 'none',
    viewBox: '0 0 24 24',
    'aria-hidden': true,
  };

  switch (icon) {
    case 'globe':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M4.2 12h15.6M12 3.8c2.4 2.5 3.6 5.2 3.6 8.2s-1.2 5.7-3.6 8.2c-2.4-2.5-3.6-5.2-3.6-8.2S9.6 6.3 12 3.8Z" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
    case 'bulb':
      return (
        <svg {...common}>
          <path d="M9.2 17.4h5.6M10.2 20h3.6M8.2 14.2A5.2 5.2 0 1 1 15.8 14.2c0 1.7-.8 2.6-1.6 3.4H9.8c-.8-.8-1.6-1.7-1.6-3.4Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      );
    case 'chart':
      return (
        <svg {...common}>
          <path d="M5 18.5h14M7.2 15.2V10M12 15.2V7.5M16.8 15.2V5.8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        </svg>
      );
    case 'heart':
      return (
        <svg {...common}>
          <path d="M19.2 12.4 12 19.2l-7.2-6.8a4.6 4.6 0 0 1 7.2-5.7 4.6 4.6 0 0 1 7.2 5.7Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      );
    default:
      return null;
  }
}

function MediaCarousel({ media = [], title = '' }) {
  const [index, setIndex] = useState(0);
  const items = Array.isArray(media) ? media.filter((item) => item?.src) : [];
  if (!items.length) return null;

  const safeIndex = Math.min(index, items.length - 1);
  const current = items[safeIndex];
  const showControls = items.length > 1;

  return (
    <div className={`informa-media${current.kind === 'video' ? ' is-video' : ''}`}>
      <div className="informa-media__stage" key={`${current.src}-${safeIndex}`}>
        {current.kind === 'video' ? (
          <video controls preload="metadata" src={resolveApiAssetUrl(current.src)} />
        ) : (
          <img
            alt={current.alt || title || 'Publicación Comergio Informa'}
            loading="lazy"
            src={resolveApiAssetUrl(current.src)}
          />
        )}
      </div>

      {showControls ? (
        <>
          <button
            aria-label="Anterior"
            className="informa-media__nav is-prev"
            onClick={() => setIndex((currentIndex) => (currentIndex - 1 + items.length) % items.length)}
            type="button"
          >
            ‹
          </button>
          <button
            aria-label="Siguiente"
            className="informa-media__nav is-next"
            onClick={() => setIndex((currentIndex) => (currentIndex + 1) % items.length)}
            type="button"
          >
            ›
          </button>
          <div className="informa-media__dots" aria-hidden="true">
            {items.map((item, dotIndex) => (
              <button
                className={`informa-media__dot${dotIndex === safeIndex ? ' is-active' : ''}`}
                key={`${item.src}-${dotIndex}`}
                onClick={() => setIndex(dotIndex)}
                type="button"
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

export default function InformaPanel({ onUnreadChange }) {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [canPublish, setCanPublish] = useState(String(user?.role || '') === 'super_admin');
  const [posts, setPosts] = useState([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [expandedComments, setExpandedComments] = useState({});
  const [commentDrafts, setCommentDrafts] = useState({});
  const [pendingLikeIds, setPendingLikeIds] = useState([]);
  const [pendingCommentKeys, setPendingCommentKeys] = useState([]);
  const [form, setForm] = useState({
    title: '',
    body: '',
    media: [],
  });

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const [metaResponse, postsResponse] = await Promise.all([
        getInformaMeta().catch(() => ({ data: { canPublish: String(user?.role || '') === 'super_admin' } })),
        getInformaPosts(),
      ]);
      setCanPublish(Boolean(metaResponse.data?.canPublish));
      setPosts(Array.isArray(postsResponse.data?.posts) ? postsResponse.data.posts : []);
      onUnreadChange?.(0);
      queryClient.invalidateQueries({ queryKey: ['informa-unread-count'] });
    } catch (loadError) {
      setError(loadError?.response?.data?.message || loadError.message || 'No se pudo cargar Comergio Informa.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updatePostInList = (updated) => {
    if (!updated?.id) return;
    setPosts((current) => current.map((item) => (item.id === updated.id ? updated : item)));
  };

  const onPickMedia = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;

    const hasVideo = form.media.some((item) => item.kind === 'video') || files.some((file) => String(file.type || '').startsWith('video/'));
    if (hasVideo && (form.media.length > 0 || files.length > 1 || form.media.some((item) => item.kind === 'image'))) {
      setError('Una publicación de video va sola. Quita las fotos o publica el video aparte.');
      return;
    }

    if (form.media.length + files.length > 10) {
      setError('Puedes agregar hasta 10 fotos en el carrusel.');
      return;
    }

    setUploading(true);
    setError('');
    try {
      const uploaded = [];
      for (const file of files) {
        const response = await uploadInformaMedia(file, file.name);
        if (response.data?.media?.src) {
          uploaded.push(response.data.media);
        }
      }
      setForm((current) => ({ ...current, media: [...current.media, ...uploaded] }));
    } catch (uploadError) {
      setError(uploadError?.response?.data?.message || uploadError.message || 'No se pudo subir el archivo.');
    } finally {
      setUploading(false);
    }
  };

  const onSubmitPost = async (event) => {
    event.preventDefault();
    if (!canPublish) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await createInformaPost({
        title: form.title,
        body: form.body,
        media: form.media,
      });
      if (response.data?.post) {
        setPosts((current) => [response.data.post, ...current]);
      }
      setForm({ title: '', body: '', media: [] });
      setComposerOpen(false);
      setNotice('Publicación enviada a Comergio Informa.');
      queryClient.invalidateQueries({ queryKey: ['informa-unread-count'] });
    } catch (saveError) {
      setError(saveError?.response?.data?.message || saveError.message || 'No se pudo publicar.');
    } finally {
      setSaving(false);
    }
  };

  const onToggleLike = async (postId) => {
    if (pendingLikeIds.includes(postId)) return;
    setPendingLikeIds((current) => [...current, postId]);
    try {
      const response = await likeInformaPost(postId);
      if (response.data?.post) updatePostInList(response.data.post);
    } catch (likeError) {
      setError(likeError?.response?.data?.message || likeError.message || 'No se pudo dar like.');
    } finally {
      setPendingLikeIds((current) => current.filter((id) => id !== postId));
    }
  };

  const onSubmitComment = async (postId) => {
    const body = String(commentDrafts[postId] || '').trim();
    if (!body) return;
    const pendingKey = `${postId}:new`;
    if (pendingCommentKeys.includes(pendingKey)) return;
    setPendingCommentKeys((current) => [...current, pendingKey]);
    try {
      const response = await commentInformaPost(postId, { body });
      if (response.data?.post) updatePostInList(response.data.post);
      setCommentDrafts((current) => ({ ...current, [postId]: '' }));
      setExpandedComments((current) => ({ ...current, [postId]: true }));
    } catch (commentError) {
      setError(commentError?.response?.data?.message || commentError.message || 'No se pudo comentar.');
    } finally {
      setPendingCommentKeys((current) => current.filter((key) => key !== pendingKey));
    }
  };

  const onToggleCommentLike = async (postId, commentId) => {
    const pendingKey = `${postId}:${commentId}:like`;
    if (pendingCommentKeys.includes(pendingKey)) return;
    setPendingCommentKeys((current) => [...current, pendingKey]);
    try {
      const response = await likeInformaComment(postId, commentId);
      if (response.data?.post) updatePostInList(response.data.post);
    } catch (likeError) {
      setError(likeError?.response?.data?.message || likeError.message || 'No se pudo dar like al comentario.');
    } finally {
      setPendingCommentKeys((current) => current.filter((key) => key !== pendingKey));
    }
  };

  const onArchive = async (postId) => {
    if (!window.confirm('¿Archivar esta publicación de Comergio Informa?')) return;
    try {
      await archiveInformaPost(postId);
      setPosts((current) => current.filter((item) => item.id !== postId));
      setNotice('Publicación archivada.');
    } catch (archiveError) {
      setError(archiveError?.response?.data?.message || archiveError.message || 'No se pudo archivar.');
    }
  };

  return (
    <section className="informa-panel">
      <header className="informa-intro">
        <span className="informa-intro__badge">Comergio Informa</span>
        <h2>Noticias que inspiran, ideas que transforman.</h2>
        <p>
          Explora lo último en educación, tecnología, innovación y mucho más.
          Información relevante para crecer juntos.
        </p>
      </header>

      <div className="informa-banner-card">
        <div className="informa-banner-card__copy">
          <h3>
            Entérate de lo <span>que está pasando</span> en el mundo.
          </h3>
          <span className="informa-banner-card__rule" aria-hidden="true" />
          <p>
            Educación · Tecnología · Innovación · Ciencia
            <br />
            Medio ambiente · Sociedad · Emprendimiento
          </p>
          {canPublish ? (
            <button className="informa-banner-card__cta" onClick={() => setComposerOpen(true)} type="button">
              Nueva publicación
            </button>
          ) : null}
        </div>
        <div className="informa-banner-card__visual">
          <img alt="" src="/informa/hero-illustration.png?v=3" />
        </div>
      </div>

      <div className="informa-features" aria-label="Beneficios de Comergio Informa">
        {FEATURES.map((feature) => (
          <article className={`informa-feature tone-${feature.tone}`} key={feature.key}>
            <span className="informa-feature__icon" aria-hidden="true">
              <FeatureIcon icon={feature.icon} />
            </span>
            <div>
              <strong>{feature.title}</strong>
              <p>{feature.description}</p>
            </div>
          </article>
        ))}
      </div>

      {notice ? <div className="informa-alert is-success">{notice}</div> : null}
      {error ? <div className="informa-alert is-error">{error}</div> : null}

      {composerOpen && canPublish ? (
        <form className="informa-composer" onSubmit={onSubmitPost}>
          <div className="informa-composer__head">
            <div>
              <h4>Publicar en Comergio Informa</h4>
              <p>Carrusel de fotos, una sola imagen o un video. Lo verá todo el equipo (sin padres ni alumnos).</p>
            </div>
            <button className="informa-composer__close" onClick={() => setComposerOpen(false)} type="button">
              Cerrar
            </button>
          </div>

          <label className="informa-field">
            Título
            <input
              maxLength={140}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="Novedad, tip o anuncio"
              required
              value={form.title}
            />
          </label>

          <label className="informa-field">
            Texto
            <textarea
              maxLength={4000}
              onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))}
              placeholder="Cuenta lo importante en pocas líneas..."
              rows={4}
              value={form.body}
            />
          </label>

          <div className="informa-composer__media">
            <button
              className="informa-secondary-btn"
              disabled={uploading || form.media.length >= 10}
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              {uploading ? 'Subiendo...' : 'Agregar fotos o video'}
            </button>
            <input
              accept="image/*,video/*"
              hidden
              multiple
              onChange={onPickMedia}
              ref={fileInputRef}
              type="file"
            />
            {form.media.length ? (
              <div className="informa-composer__previews">
                {form.media.map((item, index) => (
                  <div className="informa-composer__preview" key={`${item.src}-${index}`}>
                    {item.kind === 'video' ? (
                      <video muted preload="metadata" src={resolveApiAssetUrl(item.src)} />
                    ) : (
                      <img alt="" src={resolveApiAssetUrl(item.thumbUrl || item.src)} />
                    )}
                    <button
                      onClick={() => setForm((current) => ({
                        ...current,
                        media: current.media.filter((_, mediaIndex) => mediaIndex !== index),
                      }))}
                      type="button"
                    >
                      Quitar
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <button className="informa-primary-btn" disabled={saving || uploading || !form.title.trim()} type="submit">
            {saving ? 'Publicando...' : 'Publicar'}
          </button>
        </form>
      ) : null}

      <div className="informa-feed-shell">
        {loading ? (
          <div className="informa-empty">
            <p className="informa-muted">Cargando publicaciones...</p>
          </div>
        ) : null}

        {!loading && posts.length === 0 ? (
          <div className="informa-empty">
            <img alt="" className="informa-empty__art" src="/informa/empty-illustration.png?v=3" />
            <h3>Aún no hay publicaciones</h3>
            <p>Estamos preparando noticias increíbles para ti. Muy pronto verás contenido aquí.</p>
            {canPublish ? (
              <button className="informa-primary-btn" onClick={() => setComposerOpen(true)} type="button">
                Crear la primera
              </button>
            ) : null}
          </div>
        ) : null}

        {!loading && posts.length > 0 ? (
          <div className="informa-feed">
            {posts.map((post) => {
              const commentsOpen = Boolean(expandedComments[post.id]);
              const commentDraft = commentDrafts[post.id] || '';
              const isLikePending = pendingLikeIds.includes(post.id);
              const isCommentPending = pendingCommentKeys.includes(`${post.id}:new`);

              return (
                <article className="informa-card" key={post.id}>
                  <div className="informa-card__author">
                    <span className="informa-card__avatar">
                      <img
                        alt={INFORMA_AUTHOR_NAME}
                        onError={(event) => { event.currentTarget.src = INFORMA_AUTHOR_PHOTO; }}
                        src={INFORMA_AUTHOR_PHOTO}
                      />
                    </span>
                    <div>
                      <strong>{INFORMA_AUTHOR_NAME}</strong>
                      <span>{formatRelativeDate(post.publishedAt)}</span>
                    </div>
                    {post.canDelete ? (
                      <button className="informa-card__archive" onClick={() => onArchive(post.id)} type="button">
                        Archivar
                      </button>
                    ) : null}
                  </div>

                  <MediaCarousel media={post.media} title={post.title} />

                  <div className="informa-card__copy">
                    <h4>{post.title}</h4>
                    {post.body ? <p>{post.body}</p> : null}
                  </div>

                  <div className="informa-card__actions">
                    <button
                      aria-label={post.likedByMe ? 'Quitar like' : 'Dar like'}
                      className={`informa-card__action${post.likedByMe ? ' is-liked' : ''}`}
                      disabled={isLikePending}
                      onClick={() => onToggleLike(post.id)}
                      type="button"
                    >
                      <span aria-hidden="true">{post.likedByMe ? '♥' : '♡'}</span>
                      <strong>{Number(post.likesCount || 0)}</strong>
                    </button>
                    <button
                      className="informa-card__action"
                      onClick={() => setExpandedComments((current) => ({
                        ...current,
                        [post.id]: !commentsOpen,
                      }))}
                      type="button"
                    >
                      Comentarios {Number(post.commentsCount || 0)}
                    </button>
                  </div>

                  {commentsOpen ? (
                    <div className="informa-card__comments">
                      {(post.comments || []).length ? post.comments.map((comment) => {
                        const commentLikePendingKey = `${post.id}:${comment.id}:like`;
                        return (
                          <div className="informa-card__comment" key={comment.id}>
                            <div className="informa-card__comment-head">
                              <strong>{comment.name}</strong>
                              <span>{formatRelativeDate(comment.createdAt)}</span>
                            </div>
                            <p>{comment.body}</p>
                            <button
                              className={`informa-card__action is-compact${comment.likedByMe ? ' is-liked' : ''}`}
                              disabled={pendingCommentKeys.includes(commentLikePendingKey)}
                              onClick={() => onToggleCommentLike(post.id, comment.id)}
                              type="button"
                            >
                              {comment.likedByMe ? '♥' : '♡'} {Number(comment.likesCount || 0)}
                            </button>
                          </div>
                        );
                      }) : (
                        <p className="informa-muted">Sé el primero en comentar.</p>
                      )}

                      <form
                        className="informa-card__comment-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          onSubmitComment(post.id);
                        }}
                      >
                        <textarea
                          onChange={(event) => setCommentDrafts((current) => ({
                            ...current,
                            [post.id]: event.target.value,
                          }))}
                          placeholder="Escribe un comentario..."
                          rows={2}
                          value={commentDraft}
                        />
                        <button disabled={isCommentPending || !commentDraft.trim()} type="submit">
                          {isCommentPending ? 'Publicando...' : 'Comentar'}
                        </button>
                      </form>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}
