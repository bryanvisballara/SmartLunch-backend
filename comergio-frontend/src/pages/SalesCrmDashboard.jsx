import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  blockSalesAgendaSlot,
  createSalesEvent,
  createSalesProspect,
  deleteSalesEvent,
  deleteSalesProspect,
  getSalesAgendaSettings,
  getSalesCrm,
  getSalesProspect,
  saveSalesAgendaSettings,
  setSalesAgendaClosedDate,
  setSalesProspectStage,
  transitionSalesProspectStage,
  unblockSalesAgendaSlot,
  updateSalesProspect,
} from '../services/salesCrm.service';
import './AdmissionsDashboard.css';
import './SalesCrmDashboard.css';

const VIEWS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'clientes', label: 'Clientes' },
  { key: 'agenda', label: 'Agenda' },
];

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

function stageCode(templates, key) {
  return templates.find((s) => s.key === key)?.code || '';
}

function stageLabel(templates, key) {
  return templates.find((s) => s.key === key)?.label || key;
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

  const load = useCallback(async (nextFilters = filters, { keepSelection = true } = {}) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await getSalesCrm(nextFilters);
      setProspects(data?.prospects || []);
      setStageTemplates(data?.stageTemplates || []);
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
    setDrilldownStage('');
    try {
      const { data } = await getSalesProspect(prospect.id);
      setSelectedProspect(data?.prospect || prospect);
      setEventForm({ ...emptyEventForm, stageKey: (data?.prospect || prospect).currentStageKey, contactEmail: (data?.prospect || prospect).contactEmail });
    } catch {
      setSelectedProspect(prospect);
    }
  };

  const closeProspect = () => {
    setSelectedProspect(null);
    setEventForm(emptyEventForm);
  };

  const submitProspect = async (event) => {
    event.preventDefault();
    await runAction(async () => {
      await createSalesProspect(prospectForm);
      setShowProspectForm(false);
      setProspectForm(emptyProspectForm);
    }, 'Cliente agregado.');
  };

  const submitEvent = async (event) => {
    event.preventDefault();
    if (!selectedProspect?.id) return;
    await runAction(async () => {
      await createSalesEvent(selectedProspect.id, eventForm);
      setEventForm({ ...emptyEventForm, stageKey: selectedProspect.currentStageKey, contactEmail: selectedProspect.contactEmail });
    }, 'Evento registrado.');
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

  return (
    <div className="sales-crm-root admissions-stage">
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

      {message ? <p className="sa-message is-success">{message}</p> : null}
      {error ? <p className="sa-message is-error">{error}</p> : null}

      {!selectedProspect && view === 'dashboard' && !drilldownStage ? (
        <>
          <section className="admin-metrics-grid" aria-label="Métricas CRM">
            <article className="metric-card admin-metric-card"><span>Clientes</span><strong>{metrics.total || 0}</strong><p>Colegios en seguimiento.</p></article>
            <article className="metric-card admin-metric-card"><span>En proceso</span><strong>{metrics.inProcess || 0}</strong><p>E2 a E4 activos.</p></article>
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
            <div className="tracking-table-wrap">
              <table className="tracking-data-table">
                <thead><tr><th>Fecha</th><th>Colegio</th><th>Etapa</th><th>Título</th><th>Contacto</th></tr></thead>
                <tbody>
                  {globalEvents.length ? globalEvents.map((ev) => (
                    <tr key={`${ev.prospectId}-${ev._id}`} onClick={() => openProspect({ id: ev.prospectId, schoolName: ev.schoolName })}>
                      <td>{formatDateTime(ev.updatedAt || ev.createdAt)}</td>
                      <td>{ev.schoolName}</td>
                      <td>{ev.stageLabel}</td>
                      <td>{ev.title}</td>
                      <td>{ev.contactName || '—'}</td>
                    </tr>
                  )) : <tr><td colSpan="5"><div className="empty-state">Sin eventos recientes.</div></td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {!selectedProspect && drilldownStage ? (
        <section className="admissions-stage-results">
          <div className="admissions-stage-toolbar">
            <button className="secondary-button admissions-back-button" type="button" onClick={() => setDrilldownStage('')}>← Volver</button>
          </div>
          <h2>{stageLabel(stageTemplates, drilldownStage)}</h2>
          <div className="tracking-table-wrap">
            <table className="tracking-data-table">
              <thead><tr><th>Colegio</th><th>Ciudad</th><th>Contacto</th><th>Canal</th><th>Acción</th></tr></thead>
              <tbody>
                {filteredByDrilldown.map((p) => (
                  <tr key={p.id}>
                    <td>{p.schoolName}</td>
                    <td>{p.city || '—'}</td>
                    <td>{p.contactName || p.contactEmail || '—'}</td>
                    <td>{p.contactMethodLabel || '—'}</td>
                    <td><button className="tracking-icon-button" type="button" onClick={() => openProspect(p)}>→</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {!selectedProspect && view === 'clientes' ? (
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
          <div className="tracking-table-wrap">
            <table className="tracking-data-table">
              <thead><tr><th>Colegio</th><th>Ciudad</th><th>Dirección</th><th>Contacto</th><th>Canal</th><th>Etapa</th><th /></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan="7">Cargando…</td></tr> : null}
                {!loading && prospects.map((p) => (
                  <tr key={p.id}>
                    <td>{p.schoolName}</td>
                    <td>{p.city || '—'}</td>
                    <td>{p.address || '—'}</td>
                    <td>{p.contactName}<br /><small>{p.contactEmail}</small></td>
                    <td>{p.contactMethodLabel || '—'}</td>
                    <td>{stageLabel(stageTemplates, p.currentStageKey)}</td>
                    <td><button className="tracking-icon-button" type="button" onClick={() => openProspect(p)}>→</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {!selectedProspect && view === 'agenda' ? (
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

      {selectedProspect ? (
        <section className="dashboard-card admissions-detail-card sales-crm-detail">
          <div className="admissions-detail-header">
            <button className="secondary-button admissions-back-button" type="button" onClick={closeProspect}>← Volver</button>
            <div>
              <h2>{selectedProspect.schoolName}</h2>
              <p>{selectedProspect.city}{selectedProspect.address ? ` · ${selectedProspect.address}` : ''}</p>
              <p>{selectedProspect.contactName} · {selectedProspect.contactEmail || selectedProspect.contactPhone || 'Sin contacto'}</p>
              <p>Canal: {selectedProspect.contactMethodLabel || '—'} · Etapa: {stageCode(stageTemplates, selectedProspect.currentStageKey)} {stageLabel(stageTemplates, selectedProspect.currentStageKey)}</p>
            </div>
            <div className="sales-crm-stage-actions">
              <button className="secondary-button" disabled={busy} type="button" onClick={() => moveStage('previous')}>Etapa anterior</button>
              <button className="secondary-button" disabled={busy} type="button" onClick={() => moveStage('next')}>Siguiente etapa</button>
            </div>
          </div>

          <form className="admissions-event-form" onSubmit={submitEvent}>
            <h3>Nuevo evento</h3>
            <div className="tracking-search-grid">
              <input placeholder="Título" required value={eventForm.title} onChange={(e) => setEventForm((f) => ({ ...f, title: e.target.value }))} />
              <select value={eventForm.stageKey} onChange={(e) => setEventForm((f) => ({ ...f, stageKey: e.target.value }))}>
                {stageTemplates.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              <input placeholder="Responsable" value={eventForm.responsible} onChange={(e) => setEventForm((f) => ({ ...f, responsible: e.target.value }))} />
              <textarea placeholder="Notas" rows={2} value={eventForm.notes} onChange={(e) => setEventForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <details className="sales-crm-appointment-details">
              <summary>Cita (opcional)</summary>
              <div className="tracking-search-grid">
                <select value={eventForm.appointmentType} onChange={(e) => setEventForm((f) => ({ ...f, appointmentType: e.target.value }))}>
                  <option value="">Sin cita</option>
                  {APPOINTMENT_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <input type="date" value={eventForm.appointmentDate} onChange={(e) => setEventForm((f) => ({ ...f, appointmentDate: e.target.value }))} />
                <input type="time" value={eventForm.appointmentTime} onChange={(e) => setEventForm((f) => ({ ...f, appointmentTime: e.target.value }))} />
                <input placeholder="Correo contacto" value={eventForm.contactEmail} onChange={(e) => setEventForm((f) => ({ ...f, contactEmail: e.target.value }))} />
              </div>
            </details>
            <button className="primary-button admissions-primary" disabled={busy} type="submit">Registrar evento</button>
          </form>

          <div className="admissions-events-list">
            <h3>Historial</h3>
            {detailEvents.length ? detailEvents.map((ev) => (
              <article className="admissions-event-item" key={ev._id}>
                <div>
                  <strong>{ev.title}</strong>
                  <span>{formatDateTime(ev.createdAt)} · {ev.stageLabel}</span>
                  {ev.notes ? <p>{ev.notes}</p> : null}
                  {ev.appointment?.date ? <p>Cita: {ev.appointment.date} {ev.appointment.time} · {ev.appointment.label}</p> : null}
                </div>
                <button className="tracking-icon-button" type="button" onClick={() => removeEvent(ev._id)}>×</button>
              </article>
            )) : <p className="empty-state">Sin eventos.</p>}
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
                <label>Contacto<input value={prospectForm.contactName} onChange={(e) => setProspectForm((f) => ({ ...f, contactName: e.target.value }))} /></label>
                <label>Correo<input type="email" value={prospectForm.contactEmail} onChange={(e) => setProspectForm((f) => ({ ...f, contactEmail: e.target.value }))} /></label>
                <label>Teléfono<input value={prospectForm.contactPhone} onChange={(e) => setProspectForm((f) => ({ ...f, contactPhone: e.target.value }))} /></label>
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
