import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createStaffAnnouncement,
  getSentStaffAnnouncements,
  getStaffAnnouncementInbox,
  getStaffAnnouncementMeta,
  getStaffAnnouncementRecipients,
  getStaffAnnouncementUnreadCount,
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

export default function StaffAnnouncementsPanel({
  mode = 'inbox',
  title = 'Comunicados',
  description = 'Comunicados institucionales de rectoría y coordinación.',
  className = '',
}) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [composeDraft, setComposeDraft] = useState(() => createEmptyDraft());
  const [selectedSentId, setSelectedSentId] = useState('');

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

  const toggleTargetRole = (role) => {
    setComposeDraft((current) => {
      const selected = new Set(current.targetRoles || []);
      if (selected.has(role)) selected.delete(role);
      else selected.add(role);
      return { ...current, targetRoles: Array.from(selected) };
    });
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
      <header className="staff-announcements-panel__head">
        <div>
          <span className="staff-announcements-panel__kicker">Comunicación interna</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </header>

      {notice.text ? (
        <div className={`staff-announcements-panel__notice is-${notice.type || 'info'}`}>{notice.text}</div>
      ) : null}

      {canManage ? (
        <form className="staff-announcements-compose" onSubmit={onCreateAnnouncement}>
          <h3>Nuevo comunicado</h3>
          <label>
            Título
            <input
              maxLength={160}
              onChange={(event) => setComposeDraft((current) => ({ ...current, title: event.target.value }))}
              placeholder="Asunto del comunicado"
              value={composeDraft.title}
            />
          </label>
          <label>
            Mensaje
            <textarea
              onChange={(event) => setComposeDraft((current) => ({ ...current, body: event.target.value }))}
              placeholder="Escribe el comunicado para el equipo..."
              rows={5}
              value={composeDraft.body}
            />
          </label>
          <fieldset className="staff-announcements-roles">
            <legend>Destinatarios</legend>
            <div className="staff-announcements-roles__grid">
              {targetRoleOptions.map((option) => {
                const value = option.value || option;
                const label = option.label || option.value || option;
                const checked = (composeDraft.targetRoles || []).includes(value);
                return (
                  <label key={value}>
                    <input checked={checked} onChange={() => toggleTargetRole(value)} type="checkbox" />
                    <span>{label}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <button className="staff-announcements-btn" disabled={createMutation.isPending} type="submit">
            {createMutation.isPending ? 'Publicando...' : 'Publicar comunicado'}
          </button>
        </form>
      ) : null}

      {showInbox ? (
        <div className="staff-announcements-list">
          <h3>Bandeja recibida</h3>
          {inboxQuery.isLoading ? <p className="staff-announcements-empty">Cargando comunicados...</p> : null}
          {!inboxQuery.isLoading && inboxItems.length === 0 ? (
            <p className="staff-announcements-empty">Aún no tienes comunicados.</p>
          ) : null}
          {inboxItems.map((item) => (
            <article className={`staff-announcements-card${item.isRead ? '' : ' is-unread'}`} key={item.id}>
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
                {!item.isRead ? <span className="staff-announcements-pill">Sin leer</span> : (
                  <span className="staff-announcements-pill is-read">Leído</span>
                )}
              </div>
              <p className="staff-announcements-card__body">{item.body}</p>
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
            </article>
          ))}
        </div>
      ) : null}

      {canManage ? (
        <div className="staff-announcements-sent">
          <h3>Enviados y confirmaciones</h3>
          {sentQuery.isLoading ? <p className="staff-announcements-empty">Cargando enviados...</p> : null}
          {!sentQuery.isLoading && sentItems.length === 0 ? (
            <p className="staff-announcements-empty">Aún no has enviado comunicados al equipo.</p>
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
                <p className="staff-announcements-empty">Selecciona un comunicado para ver quién lo leyó.</p>
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
