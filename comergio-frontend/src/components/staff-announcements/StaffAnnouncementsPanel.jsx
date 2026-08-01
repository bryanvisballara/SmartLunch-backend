import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createStaffAnnouncement,
  getSentStaffAnnouncements,
  getStaffAnnouncementInbox,
  getStaffAnnouncementMeta,
  getStaffAnnouncementRecipients,
  getStaffAnnouncementUnreadCount,
  markStaffAnnouncementArchived,
  markStaffAnnouncementRead,
} from '../../services/staffAnnouncements.service';
import './StaffAnnouncementsPanel.css';

const DEFAULT_TARGET_ROLES = [
  'teacher',
  'psychology',
  'nursing',
  'academic_secretary',
  'admissions',
  'coordination',
  'billing',
];

const INBOX_TABS = [
  { key: 'inbox', label: 'Bandeja recibida' },
  { key: 'unread', label: 'No leídos' },
  { key: 'confirmed', label: 'Confirmados' },
  { key: 'archived', label: 'Archivados' },
];

function formatAnnouncementDate(value) {
  if (!value) return 'Sin fecha';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Sin fecha';
  return parsed.toLocaleString('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function createEmptyDraft(targetRoles = DEFAULT_TARGET_ROLES) {
  return {
    title: '',
    body: '',
    targetRoles: [...targetRoles],
  };
}

export function useStaffAnnouncementUnreadCount(enabled = true) {
  return useQuery({
    queryKey: ['staff-announcements', 'unread-count'],
    queryFn: getStaffAnnouncementUnreadCount,
    enabled,
    refetchInterval: 30000,
  });
}

export function StaffAnnouncementsUnreadBadge({ count = 0 }) {
  const safeCount = Number(count || 0);
  if (safeCount <= 0) return null;
  return <span className="staff-announcements-badge">{safeCount > 99 ? '99+' : safeCount}</span>;
}

function AnnouncementIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path d="M4.5 13.5h3l7 4V6.5l-7 4h-3v3Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M17.5 9a4 4 0 0 1 0 6M7.5 13.5l1 5h3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function EmptyInboxIllustration() {
  return (
    <svg aria-hidden="true" className="staff-announcements-empty-art" fill="none" viewBox="0 0 180 120">
      <path d="M28 78h124v18a10 10 0 0 1-10 10H38a10 10 0 0 1-10-10V78Z" fill="#dbeafe" />
      <path d="M28 78 90 42l62 36" stroke="#93c5fd" strokeLinejoin="round" strokeWidth="4" />
      <path d="M40 74h100v8H40Z" fill="#bfdbfe" />
      <path d="M98 34c18-8 34-4 42 8" stroke="#60a5fa" strokeDasharray="4 5" strokeLinecap="round" strokeWidth="2.5" />
      <path d="M132 28 156 36l-18 14-6-20Z" fill="#3b82f6" />
      <circle cx="54" cy="58" fill="#93c5fd" r="3" />
      <circle cx="68" cy="50" fill="#bfdbfe" r="2.5" />
    </svg>
  );
}

export default function StaffAnnouncementsPanel({
  mode = 'inbox',
  title = 'Comunicados internos',
  description = 'Recibe y confirma mensajes internos de rectoría y coordinación.',
  className = '',
}) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [composeDraft, setComposeDraft] = useState(() => createEmptyDraft());
  const [selectedSentId, setSelectedSentId] = useState('');
  const [activeTab, setActiveTab] = useState('inbox');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [senderFilter, setSenderFilter] = useState('all');

  const canManage = mode === 'manage' || mode === 'sender';
  const showInbox = mode === 'inbox' || mode === 'manage';

  const metaQuery = useQuery({
    queryKey: ['staff-announcements', 'meta'],
    queryFn: getStaffAnnouncementMeta,
    enabled: canManage,
  });

  const inboxQuery = useQuery({
    queryKey: ['staff-announcements', 'inbox'],
    queryFn: () => getStaffAnnouncementInbox({ limit: 80 }),
    enabled: showInbox,
    refetchInterval: 30000,
  });

  const sentQuery = useQuery({
    queryKey: ['staff-announcements', 'sent'],
    queryFn: () => getSentStaffAnnouncements({ limit: 80 }),
    enabled: canManage,
    refetchInterval: 30000,
  });

  const recipientsQuery = useQuery({
    queryKey: ['staff-announcements', 'recipients', selectedSentId],
    queryFn: () => getStaffAnnouncementRecipients(selectedSentId),
    enabled: canManage && Boolean(selectedSentId),
  });

  useEffect(() => {
    const roles = metaQuery.data?.data?.targetRoles || metaQuery.data?.targetRoles;
    if (!Array.isArray(roles) || !roles.length) return;
    setComposeDraft((current) => {
      if ((current.targetRoles || []).length) return current;
      return { ...current, targetRoles: roles.map((entry) => entry.value || entry) };
    });
  }, [metaQuery.data]);

  const markReadMutation = useMutation({
    mutationFn: markStaffAnnouncementRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-announcements'] });
      setNotice({ type: 'success', text: 'Confirmaste la lectura del comunicado.' });
    },
    onError: (error) => {
      setNotice({ type: 'error', text: error?.response?.data?.message || 'No se pudo confirmar la lectura.' });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: ({ id, archived }) => markStaffAnnouncementArchived(id, archived),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['staff-announcements'] });
      setNotice({
        type: 'success',
        text: variables.archived ? 'Comunicado archivado.' : 'Comunicado restaurado a la bandeja.',
      });
    },
    onError: (error) => {
      setNotice({ type: 'error', text: error?.response?.data?.message || 'No se pudo actualizar el archivo.' });
    },
  });

  const createMutation = useMutation({
    mutationFn: createStaffAnnouncement,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-announcements'] });
      setComposeDraft(createEmptyDraft(
        (metaQuery.data?.data?.targetRoles || metaQuery.data?.targetRoles || [])
          .map((entry) => entry.value || entry)
      ));
      setNotice({ type: 'success', text: 'Comunicado publicado al equipo.' });
    },
    onError: (error) => {
      setNotice({ type: 'error', text: error?.response?.data?.message || 'No se pudo publicar el comunicado.' });
    },
  });

  const inboxItems = inboxQuery.data?.data?.announcements || inboxQuery.data?.announcements || [];
  const sentItems = sentQuery.data?.data?.announcements || sentQuery.data?.announcements || [];
  const targetRoleOptions = metaQuery.data?.data?.targetRoles || metaQuery.data?.targetRoles || DEFAULT_TARGET_ROLES.map((value) => ({
    value,
    label: value,
  }));
  const recipients = recipientsQuery.data?.data?.recipients || recipientsQuery.data?.recipients || [];
  const recipientSummary = recipientsQuery.data?.data?.summary || recipientsQuery.data?.summary || null;
  const selectedRoleCount = (composeDraft.targetRoles || []).length;

  const senderOptions = useMemo(() => {
    const labels = new Map();
    inboxItems.forEach((item) => {
      const key = String(item.senderRole || item.senderName || '').trim().toLowerCase();
      if (!key) return;
      const label = item.senderRole || item.senderName || 'Equipo';
      if (!labels.has(key)) labels.set(key, label);
    });
    return Array.from(labels.entries()).map(([value, label]) => ({ value, label }));
  }, [inboxItems]);

  const stats = useMemo(() => {
    const unread = inboxItems.filter((item) => !item.isRead && !item.isArchived).length;
    const confirmed = inboxItems.filter((item) => item.isRead && !item.isArchived).length;
    const archived = inboxItems.filter((item) => item.isArchived).length;
    return { unread, confirmed, archived };
  }, [inboxItems]);

  const filteredInboxItems = useMemo(() => {
    return inboxItems.filter((item) => {
      if (activeTab === 'inbox' && item.isArchived) return false;
      if (activeTab === 'unread' && (item.isRead || item.isArchived)) return false;
      if (activeTab === 'confirmed' && (!item.isRead || item.isArchived)) return false;
      if (activeTab === 'archived' && !item.isArchived) return false;
      if (senderFilter !== 'all') {
        const key = String(item.senderRole || item.senderName || '').trim().toLowerCase();
        if (key !== senderFilter) return false;
      }
      return true;
    });
  }, [activeTab, inboxItems, senderFilter]);

  const emptyCopy = {
    inbox: {
      title: 'Tu bandeja está vacía',
      text: 'Aún no tienes comunicados internos. Los mensajes que recibas aparecerán aquí.',
    },
    unread: {
      title: 'No hay mensajes sin leer',
      text: 'Cuando llegue un comunicado nuevo, lo verás en esta sección.',
    },
    confirmed: {
      title: 'Sin confirmaciones todavía',
      text: 'Los mensajes que confirmes como leídos aparecerán aquí.',
    },
    archived: {
      title: 'No hay archivados',
      text: 'Los comunicados que archives se guardarán en esta bandeja.',
    },
  }[activeTab] || {
    title: 'Tu bandeja está vacía',
    text: 'Aún no tienes comunicados internos.',
  };

  const toggleTargetRole = (role) => {
    setComposeDraft((current) => {
      const selected = new Set(current.targetRoles || []);
      if (selected.has(role)) selected.delete(role);
      else selected.add(role);
      return { ...current, targetRoles: Array.from(selected) };
    });
  };

  const selectAllTargetRoles = () => {
    setComposeDraft((current) => ({
      ...current,
      targetRoles: targetRoleOptions.map((option) => option.value || option),
    }));
  };

  const clearTargetRoles = () => {
    setComposeDraft((current) => ({ ...current, targetRoles: [] }));
  };

  const onCreateAnnouncement = (event) => {
    event.preventDefault();
    if (!composeDraft.title.trim() || !composeDraft.body.trim()) {
      setNotice({ type: 'error', text: 'Escribe título y mensaje del comunicado.' });
      return;
    }
    if (!(composeDraft.targetRoles || []).length) {
      setNotice({ type: 'error', text: 'Selecciona al menos un rol destinatario.' });
      return;
    }
    createMutation.mutate({
      title: composeDraft.title.trim(),
      body: composeDraft.body.trim(),
      targetRoles: composeDraft.targetRoles,
    });
  };

  return (
    <section className={`staff-announcements-panel ${className}`.trim()}>
      <header className="staff-announcements-panel__hero">
        <div>
          <span className="staff-announcements-panel__kicker">Comunicados internos</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </header>

      {notice.text ? (
        <div className={`staff-announcements-panel__notice is-${notice.type || 'info'}`}>{notice.text}</div>
      ) : null}

      {canManage ? (
        <form className="staff-announcements-compose" onSubmit={onCreateAnnouncement}>
          <div className="staff-announcements-compose__head">
            <div>
              <span className="staff-announcements-compose__step">Nuevo mensaje</span>
              <h3>Crear comunicado interno</h3>
              <p>La publicación llegará a los portales de los equipos seleccionados.</p>
            </div>
          </div>
          <div className="staff-announcements-compose__fields">
            <label>
              <span>Título</span>
              <input
                maxLength={160}
                onChange={(event) => setComposeDraft((current) => ({ ...current, title: event.target.value }))}
                placeholder="Ej. Reunión general de docentes"
                value={composeDraft.title}
              />
            </label>
            <label>
              <span>Mensaje</span>
              <textarea
                onChange={(event) => setComposeDraft((current) => ({ ...current, body: event.target.value }))}
                placeholder="Escribe aquí la información que debe recibir el equipo..."
                rows={6}
                value={composeDraft.body}
              />
            </label>
          </div>
          <fieldset aria-labelledby="staff-announcements-recipients-title" className="staff-announcements-roles">
            <div className="staff-announcements-roles__head">
              <div>
                <h4 id="staff-announcements-recipients-title">Destinatarios</h4>
                <p>Selecciona las áreas que recibirán este comunicado.</p>
              </div>
              <div className="staff-announcements-roles__actions">
                <span>{selectedRoleCount} seleccionados</span>
                <button onClick={selectAllTargetRoles} type="button">Seleccionar todos</button>
                <button onClick={clearTargetRoles} type="button">Limpiar</button>
              </div>
            </div>
            <div className="staff-announcements-roles__grid">
              {targetRoleOptions.map((option) => {
                const value = option.value || option;
                const label = option.label || option.value || option;
                const checked = (composeDraft.targetRoles || []).includes(value);
                return (
                  <label key={value}>
                    <input checked={checked} onChange={() => toggleTargetRole(value)} type="checkbox" />
                    <span className="staff-announcements-roles__check" aria-hidden="true">✓</span>
                    <span>{label}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <footer className="staff-announcements-compose__footer">
            <span>Los destinatarios deberán confirmar la lectura.</span>
            <button className="staff-announcements-btn" disabled={createMutation.isPending} type="submit">
              <AnnouncementIcon />
              {createMutation.isPending ? 'Publicando...' : 'Publicar comunicado interno'}
            </button>
          </footer>
        </form>
      ) : null}

      {showInbox ? (
        <div className="staff-announcements-inbox">
          <div className="staff-announcements-stats">
            <article className="staff-announcements-stat is-unread">
              <span className="staff-announcements-stat__icon" aria-hidden="true">
                <AnnouncementIcon />
              </span>
              <strong>{stats.unread}</strong>
              <h3>No leídos</h3>
              <p>Tienes {stats.unread} mensaje{stats.unread === 1 ? '' : 's'} nuevo{stats.unread === 1 ? '' : 's'}</p>
            </article>
            <article className="staff-announcements-stat is-confirmed">
              <span className="staff-announcements-stat__icon" aria-hidden="true">✓</span>
              <strong>{stats.confirmed}</strong>
              <h3>Confirmados</h3>
              <p>Mensajes que has leído</p>
            </article>
            <article className="staff-announcements-stat is-archived">
              <span className="staff-announcements-stat__icon" aria-hidden="true">▤</span>
              <strong>{stats.archived}</strong>
              <h3>Archivados</h3>
              <p>Mensajes guardados</p>
            </article>
          </div>

          <div className="staff-announcements-toolbar">
            <div className="staff-announcements-tabs" role="tablist" aria-label="Filtros de bandeja">
              {INBOX_TABS.map((tab) => (
                <button
                  aria-selected={activeTab === tab.key}
                  className={`staff-announcements-tab${activeTab === tab.key ? ' is-active' : ''}`}
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  role="tab"
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="staff-announcements-filter">
              <button
                className={`staff-announcements-filter-btn${showFilterMenu || senderFilter !== 'all' ? ' is-active' : ''}`}
                onClick={() => setShowFilterMenu((current) => !current)}
                type="button"
              >
                <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                  <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
                </svg>
                Filtrar
                <span aria-hidden="true">▾</span>
              </button>
              {showFilterMenu ? (
                <div className="staff-announcements-filter-menu" role="menu">
                  <button
                    className={senderFilter === 'all' ? 'is-active' : ''}
                    onClick={() => {
                      setSenderFilter('all');
                      setShowFilterMenu(false);
                    }}
                    type="button"
                  >
                    Todos los remitentes
                  </button>
                  {senderOptions.map((option) => (
                    <button
                      className={senderFilter === option.value ? 'is-active' : ''}
                      key={option.value}
                      onClick={() => {
                        setSenderFilter(option.value);
                        setShowFilterMenu(false);
                      }}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="staff-announcements-list-shell">
            {inboxQuery.isLoading ? <p className="staff-announcements-empty">Cargando comunicados internos...</p> : null}

            {!inboxQuery.isLoading && filteredInboxItems.length === 0 ? (
              <div className="staff-announcements-empty-state">
                <EmptyInboxIllustration />
                <strong>{emptyCopy.title}</strong>
                <p>{emptyCopy.text}</p>
              </div>
            ) : null}

            {!inboxQuery.isLoading && filteredInboxItems.length > 0 ? (
              <div className="staff-announcements-list">
                {filteredInboxItems.map((item) => (
                  <article className={`staff-announcements-card${item.isRead ? '' : ' is-unread'}${item.isArchived ? ' is-archived' : ''}`} key={item.id}>
                    <div className="staff-announcements-card__top">
                      <div>
                        <strong>{item.title}</strong>
                        <small>
                          {item.senderName || 'Equipo directivo'}
                          {item.senderRole ? ` · ${item.senderRole}` : ''}
                          {' · '}
                          {formatAnnouncementDate(item.publishedAt)}
                        </small>
                      </div>
                      {!item.isRead && !item.isArchived ? <span className="staff-announcements-pill">Sin leer</span> : null}
                      {item.isRead && !item.isArchived ? <span className="staff-announcements-pill is-read">Confirmado</span> : null}
                      {item.isArchived ? <span className="staff-announcements-pill is-archived">Archivado</span> : null}
                    </div>
                    <p className="staff-announcements-card__body">{item.body}</p>
                    <div className="staff-announcements-card__actions">
                      {!item.isRead ? (
                        <button
                          className="staff-announcements-btn staff-announcements-btn--secondary"
                          disabled={markReadMutation.isPending}
                          onClick={() => markReadMutation.mutate(item.id)}
                          type="button"
                        >
                          Confirmo que recibí y leí este comunicado
                        </button>
                      ) : (
                        <small className="staff-announcements-card__meta">
                          Confirmado el {formatAnnouncementDate(item.readAt)}
                        </small>
                      )}
                      <button
                        className="staff-announcements-btn staff-announcements-btn--ghost"
                        disabled={archiveMutation.isPending}
                        onClick={() => archiveMutation.mutate({ id: item.id, archived: !item.isArchived })}
                        type="button"
                      >
                        {item.isArchived ? 'Restaurar' : 'Archivar'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {canManage ? (
        <div className="staff-announcements-sent">
          <h3>Enviados y confirmaciones</h3>
          {sentQuery.isLoading ? <p className="staff-announcements-empty">Cargando enviados...</p> : null}
          {!sentQuery.isLoading && sentItems.length === 0 ? (
            <p className="staff-announcements-empty">Aún no has enviado comunicados internos al equipo.</p>
          ) : null}
          <div className="staff-announcements-sent__layout">
            <div className="staff-announcements-sent__list">
              {sentItems.map((item) => (
                <button
                  className={`staff-announcements-sent-item${selectedSentId === item.id ? ' is-active' : ''}`}
                  key={item.id}
                  onClick={() => setSelectedSentId(item.id)}
                  type="button"
                >
                  <strong>{item.title}</strong>
                  <small>
                    {formatAnnouncementDate(item.publishedAt)} · {item.readCount || 0}/{item.recipientCount || 0} leídos
                  </small>
                </button>
              ))}
            </div>
            <div className="staff-announcements-sent__detail">
              {!selectedSentId ? (
                <p className="staff-announcements-empty">Selecciona un comunicado interno para ver quién lo leyó.</p>
              ) : recipientsQuery.isLoading ? (
                <p className="staff-announcements-empty">Cargando confirmaciones...</p>
              ) : (
                <>
                  <div className="staff-announcements-summary">
                    <span>Total {recipientSummary?.total || recipients.length}</span>
                    <span>Leídos {recipientSummary?.read || recipients.filter((entry) => entry.isRead).length}</span>
                    <span>Pendientes {recipientSummary?.unread || recipients.filter((entry) => !entry.isRead).length}</span>
                  </div>
                  <div className="staff-announcements-recipients">
                    {recipients.map((entry) => (
                      <div className={`staff-announcements-recipient${entry.isRead ? ' is-read' : ''}`} key={entry.id}>
                        <div>
                          <strong>{entry.name}</strong>
                          <small>{entry.roleLabel || entry.role}</small>
                        </div>
                        <span>{entry.isRead ? `Leído · ${formatAnnouncementDate(entry.readAt)}` : 'Sin confirmar'}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
