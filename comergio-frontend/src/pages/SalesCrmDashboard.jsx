import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createSalesEvent,
  createSalesProspect,
  deleteSalesEvent,
  getSalesAgendaSettings,
  getSalesCrm,
  getSalesProspect,
  saveSalesAgendaSettings,
  setSalesProspectStage,
  transitionSalesProspectStage,
  updateSalesEvent,
} from '../services/salesCrm.service';
import './AdmissionsDashboard.css';
import './SalesCrmDashboard.css';

const VIEWS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'clientes', label: 'Clientes' },
  { key: 'agenda', label: 'Agenda' },
];

/** Keep in sync with backend `salesStageTemplates` (src/routes/salesCrm.routes.js). */
const SALES_CRM_STAGE_TEMPLATES = [
  { key: 'creado', code: 'E1', label: 'Creado' },
  { key: 'intento-contacto', code: 'E2', label: 'Intento de contacto' },
  { key: 'contactado', code: 'E3', label: 'Contactado' },
  { key: 'agendado', code: 'E4', label: 'Agendado' },
  { key: 'seguimiento-post-reunion', code: 'E5', label: 'Seguimiento post reunión' },
  { key: 'contratado', code: 'E6', label: 'Contratado' },
  { key: 'en-produccion', code: 'E7', label: 'En producción' },
];

function resolveStageTemplates(apiTemplates) {
  const apiList = Array.isArray(apiTemplates) ? apiTemplates : [];
  if (apiList[0]?.key === 'creado') {
    return apiList;
  }
  return SALES_CRM_STAGE_TEMPLATES;
}

const APPOINTMENT_TYPES = [
  { value: 'virtual', label: 'Cita virtual' },
  { value: 'phone', label: 'Llamada telefónica' },
  { value: 'in_person', label: 'Cita presencial' },
];

const DEFAULT_WINDOWS = [{ start: '09:00', end: '11:00' }, { start: '14:00', end: '16:00' }];

const emptyProspectForm = {
  schoolName: '',
  city: '',
  address: '',
  contactMethod: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
};

const emptyEventForm = {
  title: '',
  notes: '',
  stageKey: '',
  responsible: '',
  appointmentType: '',
  appointmentDate: '',
  appointmentTime: '',
  contactEmail: '',
};

function formatDateTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

function getLocalDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getStageCode(templates, key) {
  const index = templates.findIndex((stage) => stage.key === key);
  const template = templates[index];
  return template?.code || (index >= 0 ? `E${index + 1}` : '-');
}

function getStageLabel(templates, key) {
  return templates.find((stage) => stage.key === key)?.label || key || '-';
}

function getAppointmentTypeLabel(type) {
  return APPOINTMENT_TYPES.find((option) => option.value === type)?.label || '-';
}

function formatAppointmentDateTime(appointment = {}) {
  if (appointment?.scheduledAt) return formatDateTime(appointment.scheduledAt);
  if (appointment?.date && appointment?.time) return `${formatDate(appointment.date)} ${appointment.time}`;
  return '-';
}

function whatsappHref(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) {
    return '';
  }
  if (digits.startsWith('57') && digits.length >= 12) {
    return `https://wa.me/${digits}`;
  }
  if (digits.length === 10) {
    return `https://wa.me/57${digits}`;
  }
  return digits.length >= 10 ? `https://wa.me/57${digits.slice(-10)}` : '';
}

export default function SalesCrmDashboard() {
  const [view, setView] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [prospects, setProspects] = useState([]);
  const [stageTemplates, setStageTemplates] = useState([]);
  const [contactMethodOptions, setContactMethodOptions] = useState([]);
  const [metrics, setMetrics] = useState({});
  const [stageCounts, setStageCounts] = useState({});
  const [globalEvents, setGlobalEvents] = useState([]);
  const [scheduledEvents, setScheduledEvents] = useState([]);
  const [filters, setFilters] = useState({ search: '', city: '', stage: '', contactMethod: '' });
  const [selectedProspect, setSelectedProspect] = useState(null);
  const [showProspectForm, setShowProspectForm] = useState(false);
  const [prospectForm, setProspectForm] = useState(emptyProspectForm);
  const [eventForm, setEventForm] = useState(emptyEventForm);
  const [agendaSettings, setAgendaSettings] = useState(null);
  const [agendaWindowsDraft, setAgendaWindowsDraft] = useState(DEFAULT_WINDOWS);
  const [agendaMonthDate, setAgendaMonthDate] = useState(() => new Date());
  const [selectedAgendaDate, setSelectedAgendaDate] = useState(getLocalDateKey());
  const [drilldownStage, setDrilldownStage] = useState('');
  const [editingEventId, setEditingEventId] = useState('');

  const load = useCallback(async (nextFilters = filters, { keepSelection = true } = {}) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await getSalesCrm(nextFilters);
      setProspects(data?.prospects || []);
      setStageTemplates(resolveStageTemplates(data?.stageTemplates));
      setContactMethodOptions(data?.contactMethodOptions || []);
      setMetrics(data?.metrics || {});
      setStageCounts(data?.stageCounts || {});
      setGlobalEvents(data?.globalEvents || []);
      setScheduledEvents(data?.scheduledEvents || []);
      if (keepSelection && selectedProspect?.id) {
        const still = (data?.prospects || []).find((p) => p.id === selectedProspect.id);
        if (still) {
          const detail = await getSalesProspect(still.id);
          setSelectedProspect(detail.data?.prospect || still);
        } else {
          setSelectedProspect(null);
        }
      }
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo cargar el CRM.');
    } finally {
      setLoading(false);
    }
  }, [filters, selectedProspect?.id]);

  useEffect(() => {
    load(filters, { keepSelection: false });
  }, []);

  useEffect(() => {
    if (view !== 'agenda') return undefined;
    getSalesAgendaSettings()
      .then(({ data }) => {
        const windows = data?.windows?.length ? data.windows : DEFAULT_WINDOWS;
        setAgendaSettings(data);
        setAgendaWindowsDraft(windows.map((w) => ({ start: w.start, end: w.end })));
      })
      .catch(() => {});
    return undefined;
  }, [view]);

  const refreshSelected = async () => {
    if (!selectedProspect?.id) return;
    const { data } = await getSalesProspect(selectedProspect.id);
    setSelectedProspect(data?.prospect || null);
  };

  const runAction = async (action, successMessage) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
      setMessage(successMessage);
      await load(filters);
      await refreshSelected();
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo completar la acción.');
    } finally {
      setBusy(false);
    }
  };

  const openProspect = async (prospect) => {
    if (!prospect?.id) return;
    setMessage('');
    setError('');
    try {
      const { data } = await getSalesProspect(prospect.id);
      const fullProspect = data?.prospect || prospect;
      setSelectedProspect(fullProspect);
      setEventForm({
        ...emptyEventForm,
        stageKey: fullProspect.currentStageKey,
        contactEmail: fullProspect.contactEmail,
      });
    } catch {
      setSelectedProspect(prospect);
    }
  };

  const closeProspect = () => {
    setSelectedProspect(null);
    setEventForm(emptyEventForm);
    setEditingEventId('');
  };

  const updateEventForm = (key, value) => {
    setEventForm((previous) => ({ ...previous, [key]: value }));
  };

  const clearEventForm = () => {
    setEditingEventId('');
    setEventForm({
      ...emptyEventForm,
      stageKey: selectedProspect?.currentStageKey || '',
      contactEmail: selectedProspect?.contactEmail || '',
    });
  };

  const editEvent = (eventItem) => {
    setEditingEventId(eventItem._id || eventItem.id || '');
    setEventForm({
      title: eventItem.title || '',
      notes: eventItem.notes || '',
      stageKey: eventItem.stageKey || selectedProspect?.currentStageKey || '',
      responsible: eventItem.responsible || '',
      appointmentType: eventItem.appointment?.type || '',
      appointmentDate: eventItem.appointment?.date || '',
      appointmentTime: eventItem.appointment?.time || '',
      contactEmail: eventItem.appointment?.contactEmail || selectedProspect?.contactEmail || '',
    });
  };

  const jumpToStage = (stageKey) => {
    if (!selectedProspect?.id) return;
    runAction(
      () => setSalesProspectStage(selectedProspect.id, stageKey),
      'Etapa actualizada.',
    );
  };

  const submitProspect = async (event) => {
    event.preventDefault();
    const payload = {
      ...prospectForm,
      contactName: prospectForm.contactName.trim(),
      contactEmail: prospectForm.contactEmail.trim(),
      contactPhone: prospectForm.contactPhone.trim(),
    };
    await runAction(async () => {
      await createSalesProspect(payload);
      setShowProspectForm(false);
      setProspectForm(emptyProspectForm);
    }, 'Cliente agregado.');
  };

  const submitEvent = async (event) => {
    event.preventDefault();
    if (!selectedProspect?.id) return;
    const wasEditing = editingEventId;
    await runAction(async () => {
      if (wasEditing) {
        await updateSalesEvent(selectedProspect.id, editingEventId, eventForm);
      } else {
        await createSalesEvent(selectedProspect.id, eventForm);
      }
      setEditingEventId('');
      setEventForm({
        ...emptyEventForm,
        stageKey: selectedProspect.currentStageKey,
        contactEmail: selectedProspect.contactEmail,
      });
    }, wasEditing ? 'Evento actualizado.' : 'Evento registrado.');
  };

  const removeEvent = (eventId) => {
    if (!selectedProspect?.id || !eventId) return;
    runAction(() => deleteSalesEvent(selectedProspect.id, eventId), 'Evento eliminado.');
  };

  const moveStage = (direction) => {
    if (!selectedProspect?.id) return;
    runAction(
      () => transitionSalesProspectStage(selectedProspect.id, { direction }),
      direction === 'previous' ? 'Etapa anterior.' : 'Siguiente etapa.',
    );
  };

  const filteredByDrilldown = useMemo(() => {
    if (!drilldownStage) return prospects;
    return prospects.filter((p) => p.currentStageKey === drilldownStage);
  }, [prospects, drilldownStage]);

  const calendarDays = useMemo(() => {
    const year = agendaMonthDate.getFullYear();
    const month = agendaMonthDate.getMonth();
    const first = new Date(year, month, 1);
    const startPad = first.getDay();
    const days = [];
    for (let i = 0; i < startPad; i += 1) {
      const date = new Date(year, month, 1 - (startPad - i));
      days.push({ key: getLocalDateKey(date), dayNumber: date.getDate(), inCurrentMonth: false, date });
    }
    const lastDate = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= lastDate; d += 1) {
      const date = new Date(year, month, d);
      days.push({ key: getLocalDateKey(date), dayNumber: d, inCurrentMonth: true, date });
    }
    while (days.length % 7 !== 0) {
      const date = new Date(year, month + 1, days.length - lastDate - startPad + 1);
      days.push({ key: getLocalDateKey(date), dayNumber: date.getDate(), inCurrentMonth: false, date });
    }
    return days;
  }, [agendaMonthDate]);

  const eventsByDate = useMemo(() => {
    const map = {};
    scheduledEvents.forEach((ev) => {
      const key = ev.appointment?.date;
      if (!key) return;
      if (!map[key]) map[key] = [];
      map[key].push(ev);
    });
    return map;
  }, [scheduledEvents]);

  const saveAgenda = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await saveSalesAgendaSettings({ windows: agendaWindowsDraft });
      setAgendaSettings(data);
      setMessage('Horarios de agenda guardados.');
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  };

  const detailEvents = (selectedProspect?.salesEvents || []).slice().sort(
    (a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt),
  );

  const activeStageKey = selectedProspect?.currentStageKey || stageTemplates[0]?.key || '';
  const currentStageIndex = stageTemplates.findIndex((stage) => stage.key === activeStageKey);
  const isFinalStage = activeStageKey === 'en-produccion';
  const activeStageDisplay = `${getStageCode(stageTemplates, activeStageKey)} - ${getStageLabel(stageTemplates, activeStageKey)}`;
  const showAppointmentScheduler = activeStageKey === 'agendado' || eventForm.stageKey === 'agendado';
  const showProspectDetail = Boolean(selectedProspect);

  return (
    <div className="sales-crm-root admissions-stage admin-dashboard-main admissions-main">
      {!showProspectDetail ? (
      <nav className="sales-crm-tabs" aria-label="CRM ventas">
        {VIEWS.map((item) => (
          <button
            key={item.key}
            className={`sales-crm-tab${view === item.key ? ' is-active' : ''}`}
            type="button"
            onClick={() => { setView(item.key); setDrilldownStage(''); closeProspect(); }}
          >
            {item.label}
          </button>
        ))}
      </nav>
      ) : null}

      {message ? <p className="admissions-feedback is-success" role="status"><span>{message}</span></p> : null}
      {error ? <p className="admissions-feedback is-error" role="alert"><span>{error}</span></p> : null}

      {!showProspectDetail && view === 'dashboard' && !drilldownStage ? (
        <>
          <section className="admin-metrics-grid" aria-label="Métricas CRM">
            <article className="metric-card admin-metric-card"><span>Clientes</span><strong>{metrics.total || 0}</strong><p>Colegios en seguimiento.</p></article>
            <article className="metric-card admin-metric-card"><span>En proceso</span><strong>{metrics.inProcess || 0}</strong><p>E3 a E6 activos.</p></article>
            <article className="metric-card admin-metric-card"><span>Contratados</span><strong>{metrics.contracted || 0}</strong><p>Paso a producción pendiente.</p></article>
            <article className="metric-card admin-metric-card"><span>En producción</span><strong>{metrics.inProduction || 0}</strong><p>Implementación en curso.</p></article>
          </section>
          <section className="dashboard-card admin-distribution-card">
            <div className="admin-panel-heading"><div><h2>Distribución por etapa</h2><p>Pipeline comercial de Comergio.</p></div></div>
            <div className="stage-distribution-grid">
              {stageTemplates.map((stage, index) => (
                <button className="stage-distribution-item stage-distribution-link" key={stage.key} type="button" onClick={() => setDrilldownStage(stage.key)}>
                  <span>{stage.code || `E${index + 1}`}</span><strong>{stage.label}</strong><b>{stageCounts[stage.key] || 0}</b>
                </button>
              ))}
            </div>
          </section>
          <section className="dashboard-card tracking-table-card admin-events-card">
            <div className="admin-panel-heading"><div><h2>Últimos eventos</h2></div></div>
            <div className="tracking-table-wrap sales-crm-table-wrap">
              <table className="tracking-data-table sales-crm-table">
                <thead><tr><th>Fecha</th><th>Colegio</th><th>Etapa</th><th>Título</th><th>Contacto</th></tr></thead>
                <tbody>
                  {globalEvents.length ? globalEvents.map((ev) => (
                    <tr key={`${ev.prospectId}-${ev._id}`} onClick={() => openProspect({ id: ev.prospectId, schoolName: ev.schoolName })}>
                      <td data-label="Fecha">{formatDateTime(ev.updatedAt || ev.createdAt)}</td>
                      <td data-label="Colegio">{ev.schoolName}</td>
                      <td data-label="Etapa">{ev.stageLabel}</td>
                      <td data-label="Título">{ev.title}</td>
                      <td data-label="Contacto">{ev.contactName || '—'}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td className="sales-crm-table-empty" colSpan="5"><div className="empty-state">Sin eventos recientes.</div></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {!showProspectDetail && drilldownStage ? (
        <section className="admissions-stage-results">
          <div className="admissions-stage-toolbar">
            <button className="secondary-button admissions-back-button" type="button" onClick={() => setDrilldownStage('')}>← Volver</button>
          </div>
          <h2>{getStageLabel(stageTemplates, drilldownStage)}</h2>
          <div className="tracking-table-wrap sales-crm-table-wrap">
            <table className="tracking-data-table sales-crm-table">
              <thead><tr><th>Colegio</th><th>Ciudad</th><th>Contacto</th><th>Canal</th><th>Acción</th></tr></thead>
              <tbody>
                {filteredByDrilldown.map((p) => (
                  <tr
                    key={p.id}
                    className={selectedProspect?.id === p.id ? 'is-selected' : ''}
                    onClick={() => openProspect(p)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openProspect(p);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <td data-label="Colegio">{p.schoolName}</td>
                    <td data-label="Ciudad">{p.city || '—'}</td>
                    <td data-label="Contacto">{p.contactName || p.contactEmail || '—'}</td>
                    <td data-label="Canal">{p.contactMethodLabel || '—'}</td>
                    <td className="tracking-actions-cell" data-label="Acción">
                      <button
                        className="tracking-icon-button"
                        type="button"
                        aria-label={`Ver detalle de ${p.schoolName}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          openProspect(p);
                        }}
                      >
                        →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {!showProspectDetail && view === 'clientes' ? (
        <section className="dashboard-card tracking-selector-panel">
          <div className="admin-panel-heading">
            <div><h2>Seguimiento clientes</h2><p>Colegios prospecto fuera de la demo automática.</p></div>
            <button className="primary-button admissions-primary" type="button" onClick={() => setShowProspectForm(true)}>+ Cliente</button>
          </div>
          <div className="tracking-search-grid">
            <input placeholder="Buscar colegio o contacto" value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
            <input placeholder="Ciudad" value={filters.city} onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value }))} />
            <select value={filters.stage} onChange={(e) => setFilters((f) => ({ ...f, stage: e.target.value }))}>
              <option value="">Todas las etapas</option>
              {stageTemplates.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <select value={filters.contactMethod} onChange={(e) => setFilters((f) => ({ ...f, contactMethod: e.target.value }))}>
              <option value="">Todos los canales</option>
              {contactMethodOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button className="secondary-button" type="button" onClick={() => load(filters)}>Filtrar</button>
          </div>
          <div className="tracking-table-wrap sales-crm-table-wrap">
            <table className="tracking-data-table sales-crm-table">
              <thead><tr><th>Colegio</th><th>Ciudad</th><th>Dirección</th><th>Contacto</th><th>Canal</th><th>Etapa</th><th /></tr></thead>
              <tbody>
                {loading ? (
                  <tr><td className="sales-crm-table-empty" colSpan="7">Cargando…</td></tr>
                ) : null}
                {!loading && prospects.map((p) => (
                  <tr
                    key={p.id}
                    className={selectedProspect?.id === p.id ? 'is-selected' : ''}
                    onClick={() => openProspect(p)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openProspect(p);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <td data-label="Colegio">{p.schoolName}</td>
                    <td data-label="Ciudad">{p.city || '—'}</td>
                    <td data-label="Dirección">{p.address || '—'}</td>
                    <td data-label="Contacto">{p.contactName}<br /><small>{p.contactEmail}</small></td>
                    <td data-label="Canal">{p.contactMethodLabel || '—'}</td>
                    <td data-label="Etapa">{getStageLabel(stageTemplates, p.currentStageKey)}</td>
                    <td className="tracking-actions-cell" data-label="Acción">
                      <button
                        className="tracking-icon-button"
                        type="button"
                        aria-label={`Ver detalle de ${p.schoolName}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          openProspect(p);
                        }}
                      >
                        →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {!showProspectDetail && view === 'agenda' ? (
        <section className="dashboard-card admissions-agenda-card">
          <h2>Agenda comercial</h2>
          <form className="admissions-agenda-availability" onSubmit={saveAgenda}>
            <p>Horarios disponibles para citas con colegios (mismo modelo que admisiones).</p>
            {agendaWindowsDraft.map((window, index) => (
              <div className="admissions-agenda-window" key={`w-${index}`}>
                <label>Desde<input type="time" value={window.start} onChange={(e) => setAgendaWindowsDraft((prev) => prev.map((w, i) => (i === index ? { ...w, start: e.target.value } : w)))} /></label>
                <label>Hasta<input type="time" value={window.end} onChange={(e) => setAgendaWindowsDraft((prev) => prev.map((w, i) => (i === index ? { ...w, end: e.target.value } : w)))} /></label>
              </div>
            ))}
            <button className="primary-button admissions-primary" disabled={busy} type="submit">Guardar horarios</button>
          </form>
          <div className="admissions-calendar-grid sales-crm-calendar">
            {calendarDays.map((day) => (
              <button
                className={`admissions-calendar-day${selectedAgendaDate === day.key ? ' is-selected' : ''}${!day.inCurrentMonth ? ' is-muted' : ''}`}
                key={day.key}
                type="button"
                onClick={() => setSelectedAgendaDate(day.key)}
              >
                <span>{day.dayNumber}</span>
                {(eventsByDate[day.key] || []).slice(0, 2).map((ev) => (
                  <small key={ev._id}>{ev.appointment?.time} {ev.schoolName}</small>
                ))}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {showProspectDetail && selectedProspect ? (
        <section className="admissions-detail-page">
          <div className="admissions-detail-toolbar">
            <button
              className="secondary-button admissions-back-button"
              type="button"
              onClick={closeProspect}
            >
              ← Volver{drilldownStage ? ` a ${getStageLabel(stageTemplates, drilldownStage)}` : ''}
            </button>
          </div>

          <div className="admissions-detail-overview-grid">
            <article className="dashboard-card admissions-detail-summary-card">
              <div className="admissions-detail-title-block">
                <h1>{selectedProspect.schoolName}</h1>
                <span>{activeStageDisplay}</span>
                <b>En seguimiento comercial</b>
              </div>
              <div className="admissions-detail-metadata">
                <div><span>Ciudad</span><strong>{selectedProspect.city || '-'}</strong></div>
                <div><span>Dirección</span><strong>{selectedProspect.address || '-'}</strong></div>
                <div><span>Canal de contacto</span><strong>{selectedProspect.contactMethodLabel || '-'}</strong></div>
                <div><span>Contacto</span><strong>{selectedProspect.contactName || '-'}</strong></div>
                <div className="sales-crm-phone-field">
                  <span>Teléfono</span>
                  <strong>{selectedProspect.contactPhone || '-'}</strong>
                  {whatsappHref(selectedProspect.contactPhone) ? (
                    <a
                      className="sales-crm-whatsapp-btn"
                      href={whatsappHref(selectedProspect.contactPhone)}
                      rel="noreferrer"
                      target="_blank"
                    >
                      WhatsApp
                    </a>
                  ) : null}
                </div>
                <div><span>Correo</span><strong>{selectedProspect.contactEmail || '-'}</strong></div>
                <div><span>Registrado</span><strong>{formatDate(selectedProspect.createdAt)}</strong></div>
                <div><span>Última actualización</span><strong>{formatDateTime(selectedProspect.updatedAt)}</strong></div>
              </div>
            </article>

            <article className="dashboard-card admissions-detail-transition-card">
              <h2>Transición de etapa</h2>
              <div className="admissions-detail-transition-actions">
                <button className="secondary-button" disabled={busy || currentStageIndex <= 0} onClick={() => moveStage('previous')} type="button">← Anterior</button>
                <button className="secondary-button" disabled={busy || isFinalStage} onClick={() => moveStage('next')} type="button">Siguiente →</button>
              </div>
              <p>Puedes avanzar o retroceder libremente. La etapa actual queda en proceso.</p>
              <div className="admissions-detail-secondary-actions">
                <button className="primary-button" disabled={busy || isFinalStage} onClick={() => jumpToStage('en-produccion')} type="button">Marcar en producción</button>
              </div>
            </article>
          </div>

          <article className="dashboard-card admissions-detail-timeline-card">
            <h2>Timeline de etapas</h2>
            <div className="admissions-detail-timeline-grid">
              {stageTemplates.map((stage, index) => {
                const isCompleted = isFinalStage ? index <= currentStageIndex : index < currentStageIndex;
                const isCurrent = stage.key === activeStageKey && !isFinalStage;
                return (
                  <button
                    key={stage.key}
                    className={`admissions-detail-timeline-item ${isCompleted ? 'is-completed' : ''} ${isCurrent ? 'is-current' : ''} ${!isCompleted && !isCurrent ? 'is-pending' : ''}`}
                    type="button"
                    onClick={() => jumpToStage(stage.key)}
                  >
                    <span>{stage.code || `E${index + 1}`}</span>
                    <small>{isCompleted ? 'Completada' : isCurrent ? 'En proceso' : 'Pendiente'}</small>
                    <strong>{stage.label}</strong>
                  </button>
                );
              })}
            </div>
          </article>

          <div className="admissions-detail-work-grid">
            <article className="dashboard-card admissions-detail-events-card">
              <h2>Eventos recientes</h2>
              <div className="tracking-table-wrap sales-crm-table-wrap">
                <table className="tracking-data-table admissions-detail-events-table sales-crm-table">
                  <thead>
                    <tr><th>Fecha</th><th>Etapa</th><th>Título</th><th>Descripción</th><th>Cita</th><th>Acciones</th></tr>
                  </thead>
                  <tbody>
                    {detailEvents.map((eventItem) => {
                      const eventId = eventItem._id || eventItem.id || '';
                      return (
                        <tr key={eventId}>
                          <td data-label="Fecha">{formatDateTime(eventItem.updatedAt || eventItem.createdAt)}</td>
                          <td data-label="Etapa">{getStageCode(stageTemplates, eventItem.stageKey)}</td>
                          <td data-label="Título">{eventItem.title}</td>
                          <td data-label="Descripción">{eventItem.notes || '-'}</td>
                          <td data-label="Cita">
                            {eventItem.appointment?.type
                              ? `${eventItem.appointment.label || getAppointmentTypeLabel(eventItem.appointment.type)} · ${formatAppointmentDateTime(eventItem.appointment)}`
                              : '-'}
                          </td>
                          <td className="tracking-actions-cell" data-label="Acciones">
                            <button onClick={() => editEvent(eventItem)} type="button">✎</button>
                            <button onClick={() => removeEvent(eventId)} type="button">×</button>
                          </td>
                        </tr>
                      );
                    })}
                    {!detailEvents.length ? (
                      <tr>
                        <td className="sales-crm-table-empty" colSpan="6"><div className="empty-state">Sin eventos.</div></td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </article>

            <form className="dashboard-card admissions-detail-new-event-card" onSubmit={submitEvent}>
              <h2>{editingEventId ? 'Editar evento' : 'Nuevo evento'}</h2>
              <label><span>Título</span><input placeholder="Título" required={!showAppointmentScheduler} value={eventForm.title} onChange={(event) => updateEventForm('title', event.target.value)} /></label>
              <label><span>Descripción</span><textarea placeholder="Descripción" value={eventForm.notes} onChange={(event) => updateEventForm('notes', event.target.value)} /></label>
              <label>
                <span>Etapa relacionada</span>
                <select value={eventForm.stageKey || activeStageKey} onChange={(event) => updateEventForm('stageKey', event.target.value)}>
                  {stageTemplates.map((stage) => (
                    <option key={stage.key} value={stage.key}>{getStageCode(stageTemplates, stage.key)} - {stage.label}</option>
                  ))}
                </select>
              </label>
              <label><span>Responsable</span><input placeholder="Responsable" value={eventForm.responsible} onChange={(event) => updateEventForm('responsible', event.target.value)} /></label>
              {showAppointmentScheduler ? (
                <fieldset className="admissions-appointment-fieldset">
                  <legend>Agendar cita</legend>
                  <label><span>Tipo de cita</span><select value={eventForm.appointmentType} onChange={(event) => updateEventForm('appointmentType', event.target.value)}><option value="">Selecciona una opción</option>{APPOINTMENT_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                  <label><span>Fecha</span><input type="date" value={eventForm.appointmentDate} onChange={(event) => updateEventForm('appointmentDate', event.target.value)} /></label>
                  <label><span>Hora</span><input type="time" value={eventForm.appointmentTime} onChange={(event) => updateEventForm('appointmentTime', event.target.value)} /></label>
                  <label><span>Correo de contacto</span><input type="email" placeholder="correo@colegio.com" value={eventForm.contactEmail} onChange={(event) => updateEventForm('contactEmail', event.target.value)} /></label>
                </fieldset>
              ) : null}
              <div className="admissions-detail-event-actions">
                <button className="secondary-button" type="button" onClick={clearEventForm}>Limpiar</button>
                <button className="primary-button" disabled={busy} type="submit">{editingEventId ? 'Actualizar' : '+ Registrar'}</button>
              </div>
            </form>
          </div>
        </section>
      ) : null}

      {showProspectForm ? (
        <div className="admissions-modal-backdrop" role="presentation" onClick={() => setShowProspectForm(false)}>
          <section className="dashboard-card admissions-create-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <h2>Nuevo cliente</h2>
            <form onSubmit={submitProspect}>
              <div className="tracking-search-grid">
                <label>Colegio<input required value={prospectForm.schoolName} onChange={(e) => setProspectForm((f) => ({ ...f, schoolName: e.target.value }))} /></label>
                <label>Ciudad<input value={prospectForm.city} onChange={(e) => setProspectForm((f) => ({ ...f, city: e.target.value }))} /></label>
                <label>Dirección<input value={prospectForm.address} onChange={(e) => setProspectForm((f) => ({ ...f, address: e.target.value }))} /></label>
                <label>Canal
                  <select value={prospectForm.contactMethod} onChange={(e) => setProspectForm((f) => ({ ...f, contactMethod: e.target.value }))}>
                    <option value="">Seleccionar</option>
                    {contactMethodOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
                <label>Contacto <span className="sales-crm-optional">(opcional)</span><input value={prospectForm.contactName} onChange={(e) => setProspectForm((f) => ({ ...f, contactName: e.target.value }))} /></label>
                <label>Correo <span className="sales-crm-optional">(opcional)</span><input type="text" inputMode="email" autoComplete="email" placeholder="Si aún no lo tienes, déjalo vacío" value={prospectForm.contactEmail} onChange={(e) => setProspectForm((f) => ({ ...f, contactEmail: e.target.value }))} /></label>
                <label>Teléfono <span className="sales-crm-optional">(opcional)</span><input type="tel" value={prospectForm.contactPhone} onChange={(e) => setProspectForm((f) => ({ ...f, contactPhone: e.target.value }))} /></label>
              </div>
              <div className="admissions-modal-actions">
                <button className="secondary-button" type="button" onClick={() => setShowProspectForm(false)}>Cancelar</button>
                <button className="primary-button" disabled={busy} type="submit">Guardar</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
