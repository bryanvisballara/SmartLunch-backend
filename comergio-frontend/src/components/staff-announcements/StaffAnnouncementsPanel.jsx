import { useMemo, useState } from 'react';
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

const DEFAULT_TARGET_ROLE_OPTIONS = [
  { value: 'teacher', label: 'Docentes' },
  { value: 'psychology', label: 'Bienestar / Psicología' },
  { value: 'nursing', label: 'Enfermería' },
  { value: 'academic_secretary', label: 'Secretaría académica' },
  { value: 'admissions', label: 'Admisiones' },
  { value: 'coordination', label: 'Coordinación' },
  { value: 'billing', label: 'Cartera' },
  { value: 'human_resources', label: 'Recursos humanos' },
  { value: 'rectoria', label: 'Rectoría' },
  { value: 'direccion', label: 'Dirección' },
  { value: 'admin', label: 'Administración' },
];

const ROLE_LABEL_BY_VALUE = Object.fromEntries(
  DEFAULT_TARGET_ROLE_OPTIONS.map((option) => [option.value, option.label])
);

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

function formatSenderRole(role) {
  const key = String(role || '').trim();
  return ROLE_LABEL_BY_VALUE[key] || key;
}

function formatSentAudience(item = {}) {
  const roles = (Array.isArray(item.targetRoles) ? item.targetRoles : [])
    .map((role) => ROLE_LABEL_BY_VALUE[role] || role)
    .filter(Boolean);
  if (roles.length) {
    return roles.join(', ');
  }
  return 'Equipo seleccionado';
}

function formatPersonName(name) {
  const raw = String(name || '').trim();
  if (!raw) return 'Docente';
  const letters = raw.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '');
  const isAllCaps = letters.length >= 3 && letters === letters.toUpperCase();
  if (!isAllCaps) return raw;
  return raw
    .toLowerCase()
    .replace(/(^|[\s'-])([a-záéíóúüñ])/g, (_, sep, letter) => `${sep}${letter.toUpperCase()}`);
}

function getNameInitials(name) {
  const parts = formatPersonName(name).split(/\s+/).filter(Boolean);
  if (!parts.length) return 'D';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

const AVATAR_TONES = ['sky', 'teal', 'violet', 'amber', 'rose', 'indigo'];

function avatarToneFromName(name) {
  const key = String(name || 'docente');
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash += key.charCodeAt(index) * (index + 3);
  }
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

function visibleGradeChips(labels = [], limit = 3) {
  const items = (Array.isArray(labels) ? labels : [])
    .map((label) => formatPersonName(label))
    .filter(Boolean);
  return {
    shown: items.slice(0, limit),
    extra: Math.max(0, items.length - limit),
  };
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16 16.5 20 20.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function createEmptyDraft() {
  return {
    title: '',
    body: '',
    targetRoles: [],
    teacherLevelKeys: [],
    teacherUserIds: [],
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
  mode = 'manage',
  title = 'Comunicados internos',
  description = 'Envía y recibe mensajes internos entre el equipo del colegio. Selecciona a quién va dirigido cada comunicado.',
  className = '',
}) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [composeDraft, setComposeDraft] = useState(() => createEmptyDraft());
  const [selectedSentId, setSelectedSentId] = useState('');
  const [activeTab, setActiveTab] = useState('inbox');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [senderFilter, setSenderFilter] = useState('all');
  const [teacherSearch, setTeacherSearch] = useState('');

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
      setComposeDraft(createEmptyDraft());
      setTeacherSearch('');
      setNotice({ type: 'success', text: 'Comunicado enviado al equipo seleccionado.' });
    },
    onError: (error) => {
      setNotice({ type: 'error', text: error?.response?.data?.message || 'No se pudo publicar el comunicado.' });
    },
  });

  const inboxItems = inboxQuery.data?.data?.announcements || inboxQuery.data?.announcements || [];
  const sentItems = sentQuery.data?.data?.announcements || sentQuery.data?.announcements || [];
  const targetRoleOptions = metaQuery.data?.data?.targetRoles || metaQuery.data?.targetRoles || DEFAULT_TARGET_ROLE_OPTIONS;
  const teacherLevels = metaQuery.data?.data?.teacherLevels || metaQuery.data?.teacherLevels || [];
  const teacherDirectory = metaQuery.data?.data?.teachers || metaQuery.data?.teachers || [];
  const recipients = recipientsQuery.data?.data?.recipients || recipientsQuery.data?.recipients || [];
  const recipientSummary = recipientsQuery.data?.data?.summary || recipientsQuery.data?.summary || null;
  const selectedSentItem = sentItems.find((item) => item.id === selectedSentId)
    || recipientsQuery.data?.data?.announcement
    || recipientsQuery.data?.announcement
    || null;
  const selectedRoleCount = (composeDraft.targetRoles || []).length;
  const teachersRoleSelected = (composeDraft.targetRoles || []).includes('teacher');
  const selectedTeacherIdSet = useMemo(
    () => new Set(composeDraft.teacherUserIds || []),
    [composeDraft.teacherUserIds]
  );
  const selectedTeacherLevelSet = useMemo(
    () => new Set(composeDraft.teacherLevelKeys || []),
    [composeDraft.teacherLevelKeys]
  );
  const teacherAudienceIsAll = teachersRoleSelected && !selectedTeacherIdSet.size && !selectedTeacherLevelSet.size;
  const filteredTeacherDirectory = useMemo(() => {
    const query = String(teacherSearch || '').trim().toLowerCase();
    if (!query) {
      return teacherDirectory;
    }
    return teacherDirectory.filter((teacher) => {
      const haystack = `${formatPersonName(teacher?.name)} ${teacher?.name || ''} ${(teacher?.gradeLabels || []).join(' ')}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [teacherDirectory, teacherSearch]);

  const groupedTeacherDirectory = useMemo(() => {
    if (!filteredTeacherDirectory.length) {
      return [];
    }
    if (!teacherLevels.length) {
      return [{ key: 'all', label: '', teachers: filteredTeacherDirectory }];
    }
    const assigned = new Set();
    const groups = [];
    teacherLevels.forEach((level) => {
      const teachers = filteredTeacherDirectory.filter((teacher) => {
        if (assigned.has(teacher.id)) return false;
        return (teacher.levelKeys || []).includes(level.key);
      });
      teachers.forEach((teacher) => assigned.add(teacher.id));
      if (teachers.length) {
        groups.push({ key: level.key, label: level.label, teachers });
      }
    });
    const others = filteredTeacherDirectory.filter((teacher) => !assigned.has(teacher.id));
    if (others.length) {
      groups.push({ key: 'otros', label: 'Otros docentes', teachers: others });
    }
    return groups;
  }, [filteredTeacherDirectory, teacherLevels]);

  const senderOptions = useMemo(() => {
    const labels = new Map();
    inboxItems.forEach((item) => {
      const key = String(item.senderRole || item.senderName || '').trim().toLowerCase();
      if (!key) return;
      const label = formatSenderRole(item.senderRole) || item.senderName || 'Equipo';
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
      if (selected.has(role)) {
        selected.delete(role);
        if (role === 'teacher') {
          return {
            ...current,
            targetRoles: Array.from(selected),
            teacherLevelKeys: [],
            teacherUserIds: [],
          };
        }
      } else {
        selected.add(role);
      }
      return { ...current, targetRoles: Array.from(selected) };
    });
  };

  const selectAllTargetRoles = () => {
    setComposeDraft((current) => ({
      ...current,
      targetRoles: targetRoleOptions.map((option) => option.value || option),
      teacherLevelKeys: [],
      teacherUserIds: [],
    }));
  };

  const clearTargetRoles = () => {
    setComposeDraft((current) => ({
      ...current,
      targetRoles: [],
      teacherLevelKeys: [],
      teacherUserIds: [],
    }));
  };

  const toggleTeacherLevel = (level) => {
    setComposeDraft((current) => {
      const selectedLevels = new Set(current.teacherLevelKeys || []);
      const selectedTeachers = new Set(current.teacherUserIds || []);
      const levelIds = Array.isArray(level?.teacherUserIds) ? level.teacherUserIds : [];
      const wasSelected = selectedLevels.has(level.key);

      if (wasSelected) {
        selectedLevels.delete(level.key);
        const remainingLevelTeacherIds = new Set(
          teacherLevels
            .filter((item) => item.key !== level.key && selectedLevels.has(item.key))
            .flatMap((item) => item.teacherUserIds || [])
        );
        levelIds.forEach((teacherId) => {
          if (!remainingLevelTeacherIds.has(teacherId)) {
            selectedTeachers.delete(teacherId);
          }
        });
      } else {
        selectedLevels.add(level.key);
        levelIds.forEach((teacherId) => selectedTeachers.add(teacherId));
      }

      const roles = new Set(current.targetRoles || []);
      roles.add('teacher');
      return {
        ...current,
        targetRoles: Array.from(roles),
        teacherLevelKeys: Array.from(selectedLevels),
        teacherUserIds: Array.from(selectedTeachers),
      };
    });
  };

  const toggleTeacher = (teacherId) => {
    setComposeDraft((current) => {
      const selectedTeachers = new Set(current.teacherUserIds || []);
      if (selectedTeachers.has(teacherId)) {
        selectedTeachers.delete(teacherId);
      } else {
        selectedTeachers.add(teacherId);
      }
      const selectedLevels = (current.teacherLevelKeys || []).filter((levelKey) => {
        const level = teacherLevels.find((item) => item.key === levelKey);
        if (!level) {
          return false;
        }
        return (level.teacherUserIds || []).every((id) => selectedTeachers.has(id));
      });
      const roles = new Set(current.targetRoles || []);
      roles.add('teacher');
      return {
        ...current,
        targetRoles: Array.from(roles),
        teacherLevelKeys: selectedLevels,
        teacherUserIds: Array.from(selectedTeachers),
      };
    });
  };

  const selectAllTeachers = () => {
    setComposeDraft((current) => ({
      ...current,
      targetRoles: Array.from(new Set([...(current.targetRoles || []), 'teacher'])),
      teacherLevelKeys: [],
      teacherUserIds: [],
    }));
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
      targetTeacherUserIds: teachersRoleSelected && !teacherAudienceIsAll ? composeDraft.teacherUserIds : [],
      targetTeacherLevelKeys: teachersRoleSelected && !teacherAudienceIsAll ? composeDraft.teacherLevelKeys : [],
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
              <h3>Redactar comunicado</h3>
              <p>Elige a quién va dirigido: coordinación, rectoría, bienestar, enfermería u otras áreas.</p>
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
            {teachersRoleSelected ? (
              <div className="staff-announcements-teachers">
                <div className="staff-announcements-teachers__intro">
                  <div>
                    <div className="staff-announcements-teachers__title-row">
                      <strong>Audiencia de docentes</strong>
                      <span className={`staff-announcements-teachers__count${teacherAudienceIsAll ? ' is-all' : ''}`}>
                        {teacherAudienceIsAll
                          ? 'Todos los docentes'
                          : `${selectedTeacherIdSet.size} seleccionado${selectedTeacherIdSet.size === 1 ? '' : 's'}`}
                      </span>
                    </div>
                    <p>
                      {teacherAudienceIsAll
                        ? 'El comunicado llegará a todo el cuerpo docente. Acota por nivel o elige personas.'
                        : 'Solo recibirán el mensaje los docentes marcados abajo.'}
                    </p>
                  </div>
                  <button onClick={selectAllTeachers} type="button">Todos los docentes</button>
                </div>

                {teacherLevels.length ? (
                  <div className="staff-announcements-teachers__block">
                    <h5>Por nivel</h5>
                    <div className="staff-announcements-teachers__levels" role="group" aria-label="Niveles educativos">
                      {teacherLevels.map((level) => {
                        const checked = selectedTeacherLevelSet.has(level.key)
                          && (level.teacherUserIds || []).every((teacherId) => selectedTeacherIdSet.has(teacherId));
                        const mixed = !checked && (level.teacherUserIds || []).some((teacherId) => selectedTeacherIdSet.has(teacherId));
                        return (
                          <label
                            className={`staff-announcements-level-chip${checked ? ' is-selected' : ''}${mixed ? ' is-mixed' : ''}`}
                            key={level.key}
                          >
                            <input
                              checked={checked}
                              onChange={() => toggleTeacherLevel(level)}
                              type="checkbox"
                            />
                            <span className="staff-announcements-level-chip__mark" aria-hidden="true">
                              {checked ? '✓' : mixed ? '–' : ''}
                            </span>
                            <span className="staff-announcements-level-chip__copy">
                              <strong>{level.label}</strong>
                              <small>{level.teacherCount || 0} docente{(level.teacherCount || 0) === 1 ? '' : 's'}</small>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="staff-announcements-teachers__block">
                  <div className="staff-announcements-teachers__list-head">
                    <h5>Directorio</h5>
                    <span>
                      {filteredTeacherDirectory.length} de {teacherDirectory.length}
                    </span>
                  </div>
                  <div className="staff-announcements-teachers__search-wrap">
                    <SearchIcon />
                    <input
                      aria-label="Buscar docente por nombre"
                      onChange={(event) => setTeacherSearch(event.target.value)}
                      placeholder="Buscar por nombre o grado"
                      type="search"
                      value={teacherSearch}
                    />
                    {teacherSearch ? (
                      <button onClick={() => setTeacherSearch('')} type="button">
                        Limpiar
                      </button>
                    ) : null}
                  </div>
                  {!teacherDirectory.length ? (
                    <p className="staff-announcements-teachers__empty">No hay docentes activos para seleccionar.</p>
                  ) : filteredTeacherDirectory.length === 0 ? (
                    <p className="staff-announcements-teachers__empty">Ningún docente coincide con la búsqueda.</p>
                  ) : (
                    <div className="staff-announcements-teachers__directory">
                      {groupedTeacherDirectory.map((group) => (
                        <section className="staff-announcements-teachers__group" key={group.key}>
                          {group.label ? (
                            <header className="staff-announcements-teachers__group-head">
                              <h6>{group.label}</h6>
                              <span>{group.teachers.length}</span>
                            </header>
                          ) : null}
                          <div className="staff-announcements-teachers__list">
                            {group.teachers.map((teacher) => {
                              const checked = selectedTeacherIdSet.has(teacher.id);
                              const chips = visibleGradeChips(teacher.gradeLabels);
                              return (
                                <label
                                  className={`staff-announcements-teacher${checked ? ' is-selected' : ''}`}
                                  key={teacher.id}
                                  title={teacher.gradeLabels?.length ? teacher.gradeLabels.join(' · ') : undefined}
                                >
                                  <input
                                    checked={checked}
                                    onChange={() => toggleTeacher(teacher.id)}
                                    type="checkbox"
                                  />
                                  <span
                                    className={`staff-announcements-teacher__avatar is-${avatarToneFromName(teacher.name)}`}
                                    aria-hidden="true"
                                  >
                                    {checked ? '✓' : getNameInitials(teacher.name)}
                                  </span>
                                  <span className="staff-announcements-teacher__body">
                                    <strong>{formatPersonName(teacher.name)}</strong>
                                    {chips.shown.length ? (
                                      <span className="staff-announcements-teacher__grades">
                                        {chips.shown.map((grade) => (
                                          <em key={grade}>{grade}</em>
                                        ))}
                                        {chips.extra ? <em className="is-more">+{chips.extra}</em> : null}
                                      </span>
                                    ) : (
                                      <span className="staff-announcements-teacher__hint">Sin grados asignados</span>
                                    )}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </section>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </fieldset>
          <footer className="staff-announcements-compose__footer">
            <span>Los destinatarios deberán confirmar la lectura.</span>
            <button className="staff-announcements-btn" disabled={createMutation.isPending} type="submit">
              <AnnouncementIcon />
              {createMutation.isPending ? 'Enviando...' : 'Enviar comunicado'}
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
                          {item.senderName || 'Equipo'}
                          {item.senderRole ? ` · ${formatSenderRole(item.senderRole)}` : ''}
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
        <div className={`staff-announcements-sent${selectedSentId ? ' is-reading' : ''}`}>
          <div className="staff-announcements-sent__head">
            <div>
              <h3>Bandeja de enviados</h3>
              <p>Revisa el contenido que ya enviaste y quién lo confirmó como leído.</p>
            </div>
          </div>
          {sentQuery.isLoading ? <p className="staff-announcements-empty">Cargando enviados...</p> : null}
          {!sentQuery.isLoading && sentItems.length === 0 ? (
            <p className="staff-announcements-empty">Aún no has enviado comunicados internos al equipo.</p>
          ) : null}
          {sentItems.length ? (
          <div className="staff-announcements-sent__layout">
            <div className="staff-announcements-sent__list" role="listbox" aria-label="Comunicados enviados">
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
                <p className="staff-announcements-empty">Selecciona un enviado para ver el mensaje y las confirmaciones de lectura.</p>
              ) : recipientsQuery.isLoading && !selectedSentItem ? (
                <p className="staff-announcements-empty">Cargando comunicado...</p>
              ) : (
                <>
                  <div className="staff-announcements-sent__message">
                    <div className="staff-announcements-sent__message-head">
                      <div>
                        <span className="staff-announcements-sent__kicker">Enviado</span>
                        <h4>{selectedSentItem?.title || 'Comunicado interno'}</h4>
                        <small>
                          {formatAnnouncementDate(selectedSentItem?.publishedAt)}
                          {selectedSentItem?.senderName ? ` · ${selectedSentItem.senderName}` : ''}
                        </small>
                        <small>Para: {formatSentAudience(selectedSentItem)}</small>
                      </div>
                      <button
                        className="staff-announcements-btn staff-announcements-btn--ghost"
                        onClick={() => setSelectedSentId('')}
                        type="button"
                      >
                        Cerrar
                      </button>
                    </div>
                    <p className="staff-announcements-sent__body">
                      {String(selectedSentItem?.body || '').trim() || 'Este comunicado no tiene contenido.'}
                    </p>
                  </div>
                  <div className="staff-announcements-sent__reads">
                    <h5>Confirmaciones de lectura</h5>
                    <div className="staff-announcements-summary">
                      <span>Total {recipientSummary?.total || recipients.length}</span>
                      <span>Leídos {recipientSummary?.read || recipients.filter((entry) => entry.isRead).length}</span>
                      <span>Pendientes {recipientSummary?.unread || recipients.filter((entry) => !entry.isRead).length}</span>
                    </div>
                    {recipientsQuery.isLoading ? (
                      <p className="staff-announcements-empty">Cargando confirmaciones...</p>
                    ) : (
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
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
