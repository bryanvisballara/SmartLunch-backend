import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { resolveApiAssetUrl } from '../../lib/api';
import {
  commentConectaCase,
  createConectaCase,
  getConectaCases,
  getConectaMeta,
  getConectaStats,
  likeConectaCase,
  likeConectaComment,
  uploadConectaImage,
} from '../../services/conecta.service';
import './ConectaPanel.css';

const FILTERS = [
  { key: 'all', label: 'Todas' },
  { key: 'featured', label: 'Destacados' },
  { key: 'unanswered', label: 'Sin responder' },
];

const SORTS = [
  { key: 'recent', label: 'Más recientes' },
  { key: 'liked', label: 'Más likes' },
  { key: 'discussed', label: 'Más respuestas' },
];

const DEFAULT_STATS = {
  activeTeachers: 100,
  schools: 0,
  sharedCases: 0,
  featured: [],
  trending: [],
};

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

function initialsFromName(name = '') {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'C';
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || 'C';
}

function roleLabel(role = '') {
  const map = {
    teacher: 'Docente',
    psychology: 'Psicología',
    nursing: 'Enfermería',
    academic_secretary: 'Secretaría',
    admissions: 'Admisiones',
    coordination: 'Coordinación',
    billing: 'Cartera',
    rectoria: 'Rectoría',
    direccion: 'Dirección',
    admin: 'Admin',
    human_resources: 'RR. HH.',
  };
  return map[String(role || '').toLowerCase()] || 'Equipo';
}

function HeartIcon({ filled = false }) {
  return (
    <svg aria-hidden="true" fill={filled ? 'currentColor' : 'none'} viewBox="0 0 24 24">
      <path
        d="M19.5 12.572 12 20l-7.5-7.428A5 5 0 0 1 12 5.076a5 5 0 0 1 7.5 7.496Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path
        d="M7.5 18.5 4 21V7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v8a2.5 2.5 0 0 1-2.5 2.5H7.5Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function ReplyIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path
        d="M9 14 4 9l5-5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M4 9h9a7 7 0 0 1 7 7v1"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path
        d="m14.2 5.4 4.4 4.4M5 19l1.1-4.2L16.8 4.1a1.7 1.7 0 0 1 2.4 0l.7.7a1.7 1.7 0 0 1 0 2.4L9.2 17.9 5 19Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function SpeechLogoIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path
        d="M5.5 6.8A2.8 2.8 0 0 1 8.3 4h7.4A2.8 2.8 0 0 1 18.5 6.8v5.9A2.8 2.8 0 0 1 15.7 15.5H10l-3.4 2.7V15.5H8.3A2.8 2.8 0 0 1 5.5 12.7V6.8Z"
        fill="currentColor"
      />
      <path d="M9 8.2h6M9 11h4.2" stroke="#fff" strokeLinecap="round" strokeWidth="1.6" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24">
      <path d="m12 3.6 2.4 4.86 5.36.78-3.88 3.78.92 5.34L12 15.84 7.2 18.36l.92-5.34L4.24 9.24l5.36-.78L12 3.6Z" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path d="M16 19v-1.2A3.8 3.8 0 0 0 12.2 14H7.8A3.8 3.8 0 0 0 4 17.8V19" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
      <circle cx="10" cy="8" r="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M20 19v-1a3 3 0 0 0-2.2-2.9M15.5 5.2a3 3 0 0 1 0 5.6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
    </svg>
  );
}

function FireIcon() {
  return (
    <svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 3c2.2 3.1 1.4 5.1.4 6.5C14.5 9 16 10.7 16 13.2A4 4 0 0 1 8.4 15c-.7-1.5.1-2.9 1.3-4.1C8.4 12.4 7 13.9 7 15.8A5 5 0 0 0 17 15.8C17 10.8 13.6 8.2 12 3Z" />
    </svg>
  );
}

function AuthorAvatar({ author, className = 'conecta-avatar' }) {
  const photo = resolveApiAssetUrl(author?.photoUrl);
  if (photo) {
    return <img alt={author?.name || 'Autor'} className={className} src={photo} />;
  }
  return <span className={`${className} conecta-avatar--fallback`}>{initialsFromName(author?.name)}</span>;
}

function FeaturedThumb({ item, tone }) {
  const photo = resolveApiAssetUrl(item?.photoUrl);
  if (photo) {
    return <img alt="" className="conecta-featured-thumb" src={photo} />;
  }
  return (
    <span className={`conecta-featured-thumb tone-${tone} conecta-featured-thumb--fallback`} aria-hidden="true">
      {initialsFromName(item?.authorName || item?.title)}
    </span>
  );
}

export default function ConectaPanel({ onUnreadChange }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cases, setCases] = useState([]);
  const [stats, setStats] = useState(DEFAULT_STATS);
  const [subjects, setSubjects] = useState([{ key: 'general', label: 'General' }]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [expandedComments, setExpandedComments] = useState({});
  const [commentDrafts, setCommentDrafts] = useState({});
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('recent');
  const [form, setForm] = useState({
    title: '',
    body: '',
    subjectKey: 'general',
    subjectLabel: 'General',
    media: [],
  });

  const subjectOptions = useMemo(
    () => (subjects.length ? subjects : [{ key: 'general', label: 'General' }]),
    [subjects],
  );

  const filteredCases = useMemo(() => {
    let next = cases.slice();

    if (filter === 'featured') {
      next = next.filter((item) => (item.likeCount || 0) >= 4 || (item.commentCount || 0) >= 2);
    } else if (filter === 'unanswered') {
      next = next.filter((item) => (item.commentCount || 0) === 0);
    }

    if (sort === 'liked') {
      next.sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0));
    } else if (sort === 'discussed') {
      next.sort((a, b) => (b.commentCount || 0) - (a.commentCount || 0));
    } else {
      next.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
    }

    return next;
  }, [cases, filter, sort]);

  const featuredItems = useMemo(() => {
    if (stats.featured?.length) return stats.featured;
    return cases
      .slice()
      .sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0))
      .slice(0, 3)
      .map((item) => ({
        id: item.id,
        title: item.title,
        schoolName: item.author?.schoolName,
        photoUrl: item.author?.photoUrl,
        authorName: item.author?.name,
      }));
  }, [cases, stats.featured]);

  const loadFeed = async () => {
    setLoading(true);
    setError('');
    try {
      const [metaResponse, casesResponse] = await Promise.all([
        getConectaMeta(),
        getConectaCases(),
      ]);
      const loadedCases = casesResponse.data?.cases || [];
      const statsFromCases = casesResponse.data?.stats || null;
      let statsPayload = statsFromCases;
      if (!statsPayload) {
        try {
          const statsResponse = await getConectaStats();
          statsPayload = statsResponse.data || null;
        } catch (_statsError) {
          statsPayload = null;
        }
      }

      const fallbackSchools = new Set(
        loadedCases.map((item) => item.author?.schoolId || item.author?.schoolName).filter(Boolean),
      ).size;

      setSubjects(metaResponse.data?.subjects || [{ key: 'general', label: 'General' }]);
      setCases(loadedCases);
      setStats({
        ...DEFAULT_STATS,
        ...(statsPayload || {}),
        schools: Number(statsPayload?.schools) > 0 ? Number(statsPayload.schools) : fallbackSchools,
        sharedCases: Number(statsPayload?.sharedCases) > 0
          ? Number(statsPayload.sharedCases)
          : loadedCases.length,
        activeTeachers: Number(statsPayload?.activeTeachers) > 0
          ? Number(statsPayload.activeTeachers)
          : 100,
        featured: Array.isArray(statsPayload?.featured) && statsPayload.featured.length
          ? statsPayload.featured
          : DEFAULT_STATS.featured,
        trending: Array.isArray(statsPayload?.trending) && statsPayload.trending.length
          ? statsPayload.trending
          : DEFAULT_STATS.trending,
      });
      onUnreadChange?.(0);
      queryClient.invalidateQueries({ queryKey: ['conecta-unread-count'] });
    } catch (loadError) {
      setError(loadError?.response?.data?.message || loadError.message || 'No se pudo cargar Conecta.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFeed();
  }, []);

  const updateCaseInList = (nextCase) => {
    setCases((current) => current.map((item) => (item.id === nextCase.id ? nextCase : item)));
  };

  const onSelectSubject = (event) => {
    const nextKey = event.target.value;
    const match = subjectOptions.find((item) => item.key === nextKey) || subjectOptions[0];
    setForm((current) => ({
      ...current,
      subjectKey: match.key,
      subjectLabel: match.label,
    }));
  };

  const onPickImages = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;

    setUploading(true);
    setError('');
    try {
      const uploaded = [];
      for (const file of files.slice(0, 4)) {
        const response = await uploadConectaImage(file, file.name);
        if (response.data?.media) {
          uploaded.push(response.data.media);
        }
      }
      setForm((current) => ({
        ...current,
        media: [...current.media, ...uploaded].slice(0, 4),
      }));
    } catch (uploadError) {
      setError(uploadError?.response?.data?.message || uploadError.message || 'No se pudo subir la imagen.');
    } finally {
      setUploading(false);
    }
  };

  const onSubmitCase = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await createConectaCase(form);
      const created = response.data?.case;
      if (created) {
        setCases((current) => [created, ...current]);
      }
      setForm({
        title: '',
        body: '',
        subjectKey: 'general',
        subjectLabel: 'General',
        media: [],
      });
      setComposerOpen(false);
      setNotice('Tu caso ya está en Conecta. El equipo de todos los colegios fue notificado.');
    } catch (submitError) {
      setError(submitError?.response?.data?.message || submitError.message || 'No se pudo publicar el caso.');
    } finally {
      setSaving(false);
    }
  };

  const onToggleLike = async (caseItem) => {
    try {
      const response = await likeConectaCase(caseItem.id);
      if (response.data?.case) updateCaseInList(response.data.case);
    } catch (likeError) {
      setError(likeError?.response?.data?.message || likeError.message || 'No se pudo dar like.');
    }
  };

  const onToggleCommentLike = async (caseItem, comment) => {
    try {
      const response = await likeConectaComment(caseItem.id, comment.id);
      if (response.data?.case) updateCaseInList(response.data.case);
    } catch (likeError) {
      setError(likeError?.response?.data?.message || likeError.message || 'No se pudo dar like al comentario.');
    }
  };

  const onSubmitComment = async (caseItem) => {
    const body = String(commentDrafts[caseItem.id] || '').trim();
    if (!body) return;
    try {
      const response = await commentConectaCase(caseItem.id, { body });
      if (response.data?.case) updateCaseInList(response.data.case);
      setCommentDrafts((current) => ({ ...current, [caseItem.id]: '' }));
      setExpandedComments((current) => ({ ...current, [caseItem.id]: true }));
    } catch (commentError) {
      setError(commentError?.response?.data?.message || commentError.message || 'No se pudo comentar.');
    }
  };

  const openComments = (caseId) => {
    setExpandedComments((current) => ({ ...current, [caseId]: true }));
  };

  return (
    <section className="conecta-panel">
      <div className="conecta-hero">
        <div className="conecta-hero__copy">
          <div className="conecta-hero__brand">
            <span className="conecta-hero__brand-icon"><SpeechLogoIcon /></span>
            <span>Conecta</span>
          </div>
          <h2>Casos reales entre el equipo de todos los colegios Comergio.</h2>
          <p>Comparte, pregunta, aprende y crece junto a otros docentes de la red.</p>
          <button className="conecta-hero__cta" onClick={() => setComposerOpen(true)} type="button">
            <PencilIcon />
            Publicar un caso
          </button>
        </div>
        <div className="conecta-hero__visual">
          <img alt="" src="/conecta/hero-team.png" />
        </div>
      </div>

      {notice ? <div className="conecta-banner is-success">{notice}</div> : null}
      {error ? <div className="conecta-banner is-error">{error}</div> : null}

      {composerOpen ? (
        <form className="conecta-composer" onSubmit={onSubmitCase}>
          <div className="conecta-composer__head">
            <div>
              <h4>Nuevo caso</h4>
              <p>Comparte contexto, asignatura y fotos para que otros puedan ayudarte mejor.</p>
            </div>
            <button className="conecta-composer__close" onClick={() => setComposerOpen(false)} type="button">
              Cerrar
            </button>
          </div>

          <label className="conecta-field">
            Asignatura o enfoque
            <select value={form.subjectKey} onChange={onSelectSubject}>
              {subjectOptions.map((option) => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="conecta-field">
            Título del caso
            <input
              maxLength={140}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="Cómo motivar lectura en grado 8 sin saturar"
              required
              value={form.title}
            />
          </label>

          <label className="conecta-field">
            Describe el caso
            <textarea
              maxLength={4000}
              onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))}
              placeholder="Qué está pasando, qué ya intentaste y qué ayuda necesitas..."
              required
              rows={5}
              value={form.body}
            />
          </label>

          <div className="conecta-composer__media">
            <button
              className="conecta-secondary-btn"
              disabled={uploading || form.media.length >= 4}
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              {uploading ? 'Subiendo...' : 'Agregar fotos'}
            </button>
            <input
              accept="image/*"
              hidden
              multiple
              onChange={onPickImages}
              ref={fileInputRef}
              type="file"
            />
            <div className="conecta-composer__thumbs">
              {form.media.map((item) => (
                <figure key={item.src}>
                  <img alt={item.alt || 'Adjunto'} src={resolveApiAssetUrl(item.thumbUrl || item.src)} />
                  <button
                    onClick={() => setForm((current) => ({
                      ...current,
                      media: current.media.filter((mediaItem) => mediaItem.src !== item.src),
                    }))}
                    type="button"
                  >
                    Quitar
                  </button>
                </figure>
              ))}
            </div>
          </div>

          <div className="conecta-composer__actions">
            <button className="conecta-primary-btn" disabled={saving || uploading} type="submit">
              {saving ? 'Publicando...' : 'Publicar para toda la red'}
            </button>
          </div>
        </form>
      ) : null}

      <div className="conecta-layout">
        <div className="conecta-main">
          <div className="conecta-filters">
            <div className="conecta-filters__pills" role="tablist">
              {FILTERS.map((item) => (
                <button
                  aria-selected={filter === item.key}
                  className={`conecta-pill${filter === item.key ? ' is-active' : ''}`}
                  key={item.key}
                  onClick={() => setFilter(item.key)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
            <label className="conecta-sort">
              <select value={sort} onChange={(event) => setSort(event.target.value)}>
                {SORTS.map((item) => (
                  <option key={item.key} value={item.key}>{item.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="conecta-feed">
            {loading ? <p className="conecta-empty">Cargando la red Conecta...</p> : null}
            {!loading && filteredCases.length === 0 ? (
              <div className="conecta-empty-card">
                <strong>No hay casos con este filtro</strong>
                <p>Prueba otra búsqueda o publica un caso para abrir la conversación entre colegios.</p>
              </div>
            ) : null}

            {filteredCases.map((caseItem) => {
              const commentsOpen = Boolean(expandedComments[caseItem.id]);
              return (
                <article className={`conecta-card${commentsOpen ? ' is-expanded' : ''}`} key={caseItem.id}>
                  <header className="conecta-card__head">
                    <AuthorAvatar author={caseItem.author} />
                    <div className="conecta-card__identity">
                      <div className="conecta-card__name-row">
                        <strong>{caseItem.author?.name || 'Colega Comergio'}</strong>
                        <span className="conecta-role-badge">{roleLabel(caseItem.author?.role)}</span>
                      </div>
                      <span>
                        {caseItem.author?.schoolName || 'Colegio Comergio'}
                        {' · '}
                        {formatRelativeDate(caseItem.publishedAt)}
                      </span>
                    </div>
                    <button aria-label="Más opciones" className="conecta-card__menu" type="button">
                      <span />
                      <span />
                      <span />
                    </button>
                  </header>

                  <div className="conecta-card__body">
                    <h4>{caseItem.title}</h4>
                    <p>{caseItem.body}</p>
                  </div>

                  {(caseItem.media || []).length > 0 ? (
                    <div className={`conecta-card__gallery count-${Math.min(caseItem.media.length, 4)}`}>
                      {caseItem.media.map((item) => (
                        <img
                          alt={item.alt || caseItem.title}
                          key={item.src}
                          src={resolveApiAssetUrl(item.src)}
                        />
                      ))}
                    </div>
                  ) : null}

                  <div className="conecta-card__footer">
                    <span className="conecta-tag">{caseItem.subjectLabel || 'General'}</span>
                    <div className="conecta-card__stats">
                      <button
                        className="conecta-stat-btn"
                        onClick={() => setExpandedComments((current) => ({
                          ...current,
                          [caseItem.id]: !current[caseItem.id],
                        }))}
                        type="button"
                      >
                        <CommentIcon />
                        <span>{caseItem.commentCount || 0}</span>
                      </button>
                      <button
                        className={`conecta-stat-btn${caseItem.likedByMe ? ' is-liked' : ''}`}
                        onClick={() => onToggleLike(caseItem)}
                        type="button"
                      >
                        <HeartIcon filled={caseItem.likedByMe} />
                        <span>{caseItem.likeCount || 0}</span>
                      </button>
                      <button
                        className="conecta-reply-btn"
                        onClick={() => openComments(caseItem.id)}
                        type="button"
                      >
                        <ReplyIcon />
                        Responder
                      </button>
                    </div>
                  </div>

                  {commentsOpen ? (
                    <div className="conecta-comments">
                      {(caseItem.comments || []).map((comment) => (
                        <div className="conecta-comment" key={comment.id}>
                          <div className="conecta-comment__meta">
                            <strong>{comment.name}</strong>
                            <span>{comment.schoolName} · {formatRelativeDate(comment.createdAt)}</span>
                          </div>
                          <p>{comment.body}</p>
                          <button
                            className={`conecta-stat-btn is-compact${comment.likedByMe ? ' is-liked' : ''}`}
                            onClick={() => onToggleCommentLike(caseItem, comment)}
                            type="button"
                          >
                            <HeartIcon filled={comment.likedByMe} />
                            <span>{comment.likeCount || 0}</span>
                          </button>
                        </div>
                      ))}

                      <div className="conecta-comment-form">
                        <textarea
                          onChange={(event) => setCommentDrafts((current) => ({
                            ...current,
                            [caseItem.id]: event.target.value,
                          }))}
                          placeholder="Escribe una respuesta que sume..."
                          rows={2}
                          value={commentDrafts[caseItem.id] || ''}
                        />
                        <button
                          className="conecta-primary-btn is-small"
                          onClick={() => onSubmitComment(caseItem)}
                          type="button"
                        >
                          Publicar respuesta
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>

        <aside className="conecta-rail">
          <section className="conecta-rail-card">
            <header className="conecta-rail-card__head">
              <span className="conecta-rail-card__icon is-star" aria-hidden="true"><StarIcon /></span>
              <h3>Destacados de la semana</h3>
            </header>
            <ul className="conecta-featured-list">
              {featuredItems.map((item, index) => (
                <li key={item.id || item.title}>
                  <FeaturedThumb item={item} tone={(index % 3) + 1} />
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.schoolName}</span>
                  </div>
                  <span className="conecta-featured-chevron" aria-hidden="true">›</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="conecta-rail-card">
            <header className="conecta-rail-card__head">
              <span className="conecta-rail-card__icon is-people" aria-hidden="true"><PeopleIcon /></span>
              <h3>Comunidad en números</h3>
            </header>
            <div className="conecta-stats-grid">
              <div>
                <strong>{stats.activeTeachers}</strong>
                <span>Docentes activos</span>
              </div>
              <div>
                <strong>{stats.schools}</strong>
                <span>Colegios</span>
              </div>
              <div>
                <strong>{stats.sharedCases}</strong>
                <span>Casos compartidos</span>
              </div>
            </div>
          </section>

          <section className="conecta-rail-card">
            <header className="conecta-rail-card__head">
              <span className="conecta-rail-card__icon is-fire" aria-hidden="true"><FireIcon /></span>
              <h3>Temas en tendencia</h3>
            </header>
            <ul className="conecta-trending-list">
              {(stats.trending || DEFAULT_STATS.trending).map((topic) => (
                <li key={topic.tag || topic.label}>
                  <span>{topic.tag || `#${topic.label}`}</span>
                  <strong>{topic.count}</strong>
                </li>
              ))}
            </ul>
            <button className="conecta-trending-more" type="button">
              Ver más tendencias →
            </button>
          </section>
        </aside>
      </div>
    </section>
  );
}
