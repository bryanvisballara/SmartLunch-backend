import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createHrSupplyRequest,
  getHrPlannerCycles,
  getHrSupplyItems,
  getHrSupplyRequests,
  updateHrSupplyRequest,
} from '../../services/hr.service';
import '../../campus/campus.css';

const AREA_LABEL = 'Psicología - bienestar';
const SUBJECT_LABEL = 'Psicología - bienestar';
const GRADE_LABEL = 'Bienestar';
const COURSE_LABEL = 'Psicología';

const COMMON_MATERIALS = [
  'Foamy',
  'Cartón paja',
  'Papel cometa',
  'Celofán',
  'Cartulina',
  'Papel bond',
  'Silicona',
  'Pegante',
  'Tijeras',
  'Témperas',
  'Crayones',
  'Marcadores',
  'Globos',
  'Pitillos',
  'Cinta masking',
  'Papel crepé',
];

function createDraft() {
  return {
    materialKey: '',
    customMaterialName: '',
    quantity: '1',
    pendingMaterials: [],
    activityTitle: '',
    purpose: '',
    activityDate: '',
    noMaterialsNeeded: false,
  };
}

function resolveDraftMaterialName(draft = {}) {
  if (draft.materialKey === '__other__') {
    return String(draft.customMaterialName || '').trim();
  }
  return String(draft.materialKey || '').trim();
}

function formatMaterialsLabel(activity = {}) {
  const materials = Array.isArray(activity.materials) && activity.materials.length
    ? activity.materials
    : (activity.materialName
      ? [{ materialName: activity.materialName, quantity: activity.quantity || 1 }]
      : []);
  if (!materials.length) return '—';
  return materials
    .map((item) => `${item.materialName || 'Material'} ×${Math.max(1, Number(item.quantity || 1))}`)
    .join(' · ');
}

function formatDateLabel(value) {
  if (!value) return 'Sin fecha';
  const raw = String(value);
  const dateOnlyMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const parsedDate = dateOnlyMatch
    ? new Date(Date.UTC(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]), 12, 0, 0))
    : new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return 'Sin fecha';
  return parsedDate.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function toDateInputValue(isoValue) {
  if (!isoValue) return '';
  const raw = String(isoValue);
  const dateOnlyMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnlyMatch) {
    return `${dateOnlyMatch[1]}-${dateOnlyMatch[2]}-${dateOnlyMatch[3]}`;
  }
  const parsedDate = new Date(isoValue);
  if (Number.isNaN(parsedDate.getTime())) return '';
  const timezoneOffsetMs = parsedDate.getTimezoneOffset() * 60 * 1000;
  return new Date(parsedDate.getTime() - timezoneOffsetMs).toISOString().slice(0, 10);
}

function getTodayDateInputValue() {
  const today = new Date();
  const timezoneOffsetMs = today.getTimezoneOffset() * 60 * 1000;
  return new Date(today.getTime() - timezoneOffsetMs).toISOString().slice(0, 10);
}

function isPlannerSubmissionOpen(cycle) {
  const deadline = toDateInputValue(cycle?.submissionDeadline);
  if (!deadline) return true;
  return getTodayDateInputValue() <= deadline;
}

function getRequestForCycle(requests, cycleId) {
  return (Array.isArray(requests) ? requests : []).find((request) => (
    String(request.plannerCycleId || request.plannerCycle?.id || '') === String(cycleId)
    && request.status !== 'cancelled'
  )) || null;
}

function unwrapList(response, key) {
  return response?.data?.[key] || response?.[key] || [];
}

export default function PsychologyResourcePlannerPanel({ className = '' }) {
  const [cycles, setCycles] = useState([]);
  const [requests, setRequests] = useState([]);
  const [catalogItems, setCatalogItems] = useState([]);
  const [selectedCycleId, setSelectedCycleId] = useState('');
  const [draft, setDraft] = useState(createDraft);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [notice, setNotice] = useState({ type: '', text: '' });

  const selectedCycle = useMemo(
    () => cycles.find((cycle) => cycle.id === selectedCycleId) || null,
    [cycles, selectedCycleId]
  );
  const selectedRequest = useMemo(
    () => getRequestForCycle(requests, selectedCycleId),
    [requests, selectedCycleId]
  );
  const isEditable = Boolean(
    selectedCycle
    && isPlannerSubmissionOpen(selectedCycle)
    && (
      !selectedRequest
      || ['pending_coordination_review', 'returned_for_correction'].includes(selectedRequest.status)
    )
  );

  const materialOptions = useMemo(() => {
    const catalogNames = catalogItems.map((item) => String(item.name || '').trim()).filter(Boolean);
    return Array.from(new Set([...COMMON_MATERIALS, ...catalogNames])).sort((left, right) => left.localeCompare(right, 'es'));
  }, [catalogItems]);

  const loadPlannerRequestIntoDraft = useCallback((request) => {
    if (!request) {
      setDraft(createDraft());
      setActivities([]);
      return;
    }

    setDraft({
      ...createDraft(),
      noMaterialsNeeded: Boolean(request.noMaterialsNeeded),
    });
    setActivities((request.plannerActivities || []).map((activity, index) => {
      const materials = Array.isArray(activity.materials) && activity.materials.length
        ? activity.materials.map((item) => ({
          materialName: item.materialName || '',
          quantity: Math.max(1, Number(item.quantity || 1)),
        }))
        : (activity.materialName
          ? [{ materialName: activity.materialName, quantity: Math.max(1, Number(activity.quantity || 1)) }]
          : []);
      return {
        key: activity.id || `${activity.date}:${activity.title}:${index}`,
        date: toDateInputValue(activity.date),
        title: activity.title || '',
        purpose: activity.purpose || activity.description || '',
        subject: activity.subject || SUBJECT_LABEL,
        grade: activity.grade || GRADE_LABEL,
        courseLabel: activity.courseLabel || COURSE_LABEL,
        materials,
        materialName: materials[0]?.materialName || '',
        quantity: materials[0]?.quantity || 1,
      };
    }));
  }, []);

  const loadData = useCallback(async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const [cyclesRes, requestsRes, itemsRes] = await Promise.all([
        getHrPlannerCycles({ status: 'active' }),
        getHrSupplyRequests({ requestType: 'material' }),
        getHrSupplyItems({ status: 'active' }),
      ]);
      const nextCycles = unwrapList(cyclesRes, 'cycles');
      const nextRequests = unwrapList(requestsRes, 'requests');
      setCycles(nextCycles);
      setRequests(nextRequests);
      setCatalogItems(unwrapList(itemsRes, 'items'));

      setSelectedCycleId((currentId) => {
        if (currentId && nextCycles.some((cycle) => cycle.id === currentId)) {
          return currentId;
        }
        const openPending = nextCycles.find((cycle) => (
          isPlannerSubmissionOpen(cycle) && !getRequestForCycle(nextRequests, cycle.id)
        ));
        return openPending?.id || nextCycles[0]?.id || '';
      });

      return { cycles: nextCycles, requests: nextRequests };
    } catch (error) {
      setNotice({
        type: 'error',
        text: error?.response?.data?.message || error?.message || 'No se pudo cargar el planner.',
      });
      return { cycles: [], requests: [] };
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!selectedCycleId) {
      loadPlannerRequestIntoDraft(null);
      return;
    }
    loadPlannerRequestIntoDraft(getRequestForCycle(requests, selectedCycleId));
    // Solo al cambiar de periodo; un refresh no debe borrar actividades en edición.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCycleId, loadPlannerRequestIntoDraft]);

  const onDraftChange = (field, value) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const onSelectCycle = (cycleId) => {
    setSelectedCycleId(cycleId);
    setConfirmOpen(false);
    loadPlannerRequestIntoDraft(getRequestForCycle(requests, cycleId));
  };

  const onAddMaterial = () => {
    if (!isEditable) {
      setNotice({ type: 'error', text: 'Este planner ya no se puede editar.' });
      return;
    }
    if (draft.noMaterialsNeeded) {
      setNotice({ type: 'error', text: 'Desmarca “No necesito material” para agregar materiales.' });
      return;
    }

    const materialName = resolveDraftMaterialName(draft);
    const quantity = Math.max(1, Number(draft.quantity || 0));
    if (!materialName) {
      setNotice({ type: 'error', text: 'Selecciona o escribe el material.' });
      return;
    }

    setDraft((current) => ({
      ...current,
      pendingMaterials: [
        ...(Array.isArray(current.pendingMaterials) ? current.pendingMaterials : []),
        { key: `${materialName}:${quantity}:${Date.now()}`, materialName, quantity },
      ],
      materialKey: '',
      customMaterialName: '',
      quantity: '1',
    }));
    setNotice({ type: '', text: '' });
  };

  const onRemovePendingMaterial = (materialKey) => {
    if (!isEditable) return;
    setDraft((current) => ({
      ...current,
      pendingMaterials: (current.pendingMaterials || []).filter((item) => item.key !== materialKey),
    }));
  };

  const onAddActivity = () => {
    if (!isEditable) {
      setNotice({ type: 'error', text: 'Este planner ya no se puede editar.' });
      return;
    }
    if (draft.noMaterialsNeeded) {
      setNotice({ type: 'error', text: 'Desmarca “No necesito material” para agregar actividades.' });
      return;
    }

    const title = String(draft.activityTitle || '').trim();
    const purpose = String(draft.purpose || '').trim();
    const date = String(draft.activityDate || '').trim();
    const minDate = toDateInputValue(selectedCycle?.startDate);
    const maxDate = toDateInputValue(selectedCycle?.endDate);

    const materials = [...(Array.isArray(draft.pendingMaterials) ? draft.pendingMaterials : [])];
    const draftMaterialName = resolveDraftMaterialName(draft);
    const draftQuantity = Math.max(1, Number(draft.quantity || 0));
    if (draftMaterialName) {
      materials.push({
        key: `${draftMaterialName}:${draftQuantity}:${Date.now()}`,
        materialName: draftMaterialName,
        quantity: draftQuantity,
      });
    }
    const normalizedMaterials = materials
      .map((item) => ({
        materialName: String(item.materialName || '').trim(),
        quantity: Math.max(1, Number(item.quantity || 1)),
      }))
      .filter((item) => item.materialName);

    if (!normalizedMaterials.length) {
      setNotice({ type: 'error', text: 'Agrega al menos un material a la actividad.' });
      return;
    }
    if (!title || !purpose || !date) {
      setNotice({ type: 'error', text: 'Completa título, motivo y fecha de la actividad.' });
      return;
    }
    if (minDate && maxDate && minDate > maxDate) {
      setNotice({ type: 'error', text: 'Este planner tiene fechas invertidas. Pide a Rectoría o Coordinación corregir Desde/Hasta.' });
      return;
    }
    if ((minDate && date < minDate) || (maxDate && date > maxDate)) {
      setNotice({ type: 'error', text: `La fecha debe estar entre ${formatDateLabel(minDate)} y ${formatDateLabel(maxDate)}.` });
      return;
    }

    setActivities((current) => [
      ...current,
      {
        key: `${date}:${title}:${normalizedMaterials[0].materialName}:${current.length}`,
        date,
        title,
        purpose,
        subject: SUBJECT_LABEL,
        grade: GRADE_LABEL,
        courseLabel: COURSE_LABEL,
        materials: normalizedMaterials,
        materialName: normalizedMaterials[0].materialName,
        quantity: normalizedMaterials[0].quantity,
      },
    ]);
    setDraft((current) => ({
      ...createDraft(),
      noMaterialsNeeded: current.noMaterialsNeeded,
    }));
    setNotice({ type: '', text: '' });
  };

  const onRemoveActivity = (activityKey) => {
    if (!isEditable) return;
    setActivities((current) => current.filter((activity) => activity.key !== activityKey));
  };

  const buildPayload = () => {
    const noMaterialsNeeded = Boolean(draft.noMaterialsNeeded);
    const plannerActivities = noMaterialsNeeded
      ? []
      : activities.map((activity) => {
        const materials = Array.isArray(activity.materials) && activity.materials.length
          ? activity.materials.map((item) => ({
            materialName: item.materialName,
            quantity: Math.max(1, Number(item.quantity || 1)),
          }))
          : [{
            materialName: activity.materialName,
            quantity: Math.max(1, Number(activity.quantity || 1)),
          }];
        return {
          date: activity.date,
          title: activity.title,
          description: activity.purpose,
          purpose: activity.purpose,
          subject: activity.subject,
          grade: activity.grade,
          courseLabel: activity.courseLabel,
          materials,
          materialName: materials[0]?.materialName || '',
          quantity: materials[0]?.quantity || 1,
        };
      });

    return {
      requestType: 'material',
      plannerCycleId: selectedCycleId,
      noMaterialsNeeded,
      requestedForArea: AREA_LABEL,
      purpose: noMaterialsNeeded
        ? 'No necesito material para este periodo.'
        : (activities[0]?.purpose || 'Planner de Bienestar'),
      plannerActivities,
      items: noMaterialsNeeded
        ? []
        : plannerActivities.flatMap((activity) => (
          (activity.materials || []).map((material) => ({
            customName: material.materialName,
            quantity: material.quantity,
          }))
        )),
    };
  };

  const onSubmit = async () => {
    if (!selectedCycleId) {
      setNotice({ type: 'error', text: 'Selecciona un planner activo.' });
      return;
    }
    if (!isEditable) {
      setNotice({ type: 'error', text: 'La fecha límite ya venció o el planner ya no es editable.' });
      return;
    }
    if (!draft.noMaterialsNeeded && activities.length === 0) {
      setNotice({ type: 'error', text: 'Agrega al menos una actividad o marca que no necesitas material.' });
      return;
    }

    setSubmitting(true);
    setNotice({ type: '', text: '' });
    try {
      const wasReturnedForCorrection = selectedRequest?.status === 'returned_for_correction';
      const payload = buildPayload();
      const requestId = selectedRequest?.id || '';
      if (requestId) {
        await updateHrSupplyRequest(requestId, payload);
      } else {
        await createHrSupplyRequest(payload);
      }
      setConfirmOpen(false);
      setNotice({
        type: 'success',
        text: requestId
          ? (wasReturnedForCorrection
            ? 'Planner corregido y reenviado a coordinación.'
            : 'Planner actualizado correctamente.')
          : 'Planner enviado a coordinación.',
      });
      const refreshed = await loadData({ silent: true });
      loadPlannerRequestIntoDraft(getRequestForCycle(refreshed.requests, selectedCycleId));
    } catch (error) {
      setNotice({
        type: 'error',
        text: error?.response?.data?.message || error?.message || 'No se pudo enviar el planner.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const panelClassName = ['campus-teacher__recursos-panel', 'campus-teacher__embedded-panel', className]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={panelClassName}>
      <header className="campus-teacher__recursos-hero">
        <div>
          <span className="campus-teacher__recursos-kicker">Bienestar</span>
          <h2>Planner de recursos</h2>
          <p>Selecciona un periodo activo y solicita los materiales que necesitas para acompañamientos y actividades de Psicología.</p>
        </div>
        <button
          className="campus-teacher__recursos-refresh"
          disabled={loading || refreshing}
          onClick={() => loadData({ silent: true })}
          type="button"
        >
          <span aria-hidden="true" className={refreshing ? 'is-spinning' : ''}>↻</span>
          Actualizar
        </button>
      </header>

      {notice.text ? (
        <p className={`psychology-notice ${notice.type || 'info'}`} style={{ marginBottom: '1rem' }}>
          {notice.text}
        </p>
      ) : null}

      {loading ? <p className="campus-panel__meta">Cargando planners...</p> : null}

      {!loading && cycles.length === 0 ? (
        <div className="campus-teacher__recursos-empty">
          <div className="campus-teacher__recursos-empty-icon" aria-hidden="true">📦</div>
          <div>
            <strong>No hay planners activos</strong>
            <p>Cuando coordinación o rectoría publiquen un periodo, aparecerá aquí.</p>
          </div>
        </div>
      ) : null}

      {cycles.length > 0 ? (
        <div className="campus-teacher__recursos-cycles">
          {cycles.map((cycle) => {
            const existingRequest = getRequestForCycle(requests, cycle.id);
            const isSubmitted = Boolean(existingRequest);
            const isSelected = selectedCycleId === cycle.id;
            const isOpen = isPlannerSubmissionOpen(cycle);
            return (
              <button
                className={`campus-teacher__recursos-cycle${isSubmitted ? ' is-submitted' : ' is-pending'}${isSelected ? ' is-selected' : ''}${!isOpen ? ' is-closed' : ''}`}
                key={cycle.id}
                onClick={() => onSelectCycle(cycle.id)}
                type="button"
              >
                <span className="campus-teacher__recursos-cycle-status">
                  {isSubmitted ? 'Enviado' : (isOpen ? 'Pendiente' : 'Cerrado')}
                </span>
                <strong>{cycle.title}</strong>
                <span>{formatDateLabel(cycle.startDate)} – {formatDateLabel(cycle.endDate)}</span>
                <span>Límite {formatDateLabel(cycle.submissionDeadline)}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {selectedCycle ? (
        <div className="campus-teacher__recursos-workspace">
          <div className="campus-teacher__recursos-period">
            <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
              <rect height="16" rx="2" stroke="currentColor" strokeWidth="1.7" width="16" x="4" y="5" />
              <path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
            </svg>
            <div>
              <strong>Periodo: {formatDateLabel(selectedCycle.startDate)} – {formatDateLabel(selectedCycle.endDate)}</strong>
              <span>{selectedCycle.title}</span>
            </div>
          </div>

          <div className="campus-teacher__recursos-banner">
            <span aria-hidden="true">i</span>
            <p>
              Límite de entrega: {formatDateLabel(selectedCycle.submissionDeadline)}.
              {selectedCycle.instructions
                ? ` ${selectedCycle.instructions}`
                : ' Solicita aquí los materiales que necesitas para este periodo.'}
            </p>
          </div>

          {!isEditable ? (
            <p className="campus-teacher__recursos-locked">
              {selectedRequest
                && !['pending_coordination_review', 'returned_for_correction'].includes(selectedRequest.status)
                ? 'Este planner ya avanzó en el flujo y no se puede editar aquí.'
                : 'La fecha límite ya venció. Solo puedes consultar el historial.'}
            </p>
          ) : null}

          {selectedRequest?.status === 'returned_for_correction' && selectedRequest.coordinationObservation ? (
            <div className="campus-teacher__recursos-return-banner">
              <strong>Devuelto para corrección</strong>
              <p>{selectedRequest.coordinationObservation}</p>
              <span>Corrige el planner y vuelve a enviarlo a coordinación.</span>
            </div>
          ) : null}

          {selectedRequest && !isEditable ? (
            <section className="campus-teacher__recursos-card">
              <div className="campus-teacher__recursos-card-head">
                <h3>Historial enviado</h3>
              </div>
              {selectedRequest.noMaterialsNeeded ? (
                <p className="campus-panel__meta">Marcaste que no necesitas material para este periodo.</p>
              ) : null}
              <div className="campus-teacher__recursos-table-wrap">
                <table className="campus-teacher__recursos-table">
                  <thead>
                    <tr>
                      <th>Área</th>
                      <th>Materiales</th>
                      <th>Actividad</th>
                      <th>Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedRequest.plannerActivities || []).length ? (
                      selectedRequest.plannerActivities.map((activity) => (
                        <tr key={activity.id || `${activity.title}-${activity.date}`}>
                          <td>{activity.subject || AREA_LABEL}</td>
                          <td>{formatMaterialsLabel(activity)}</td>
                          <td>
                            <strong>{activity.title || '—'}</strong>
                            {activity.purpose ? <small>{activity.purpose}</small> : null}
                          </td>
                          <td>{formatDateLabel(activity.date)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4}>
                          {(selectedRequest.items || []).map((entry) => `${entry.item?.name || entry.customName || 'Material'} x${entry.quantity}`).join(' · ') || 'Sin detalle de actividades.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {isEditable ? (
            <>
              <section className="campus-teacher__recursos-card">
                <div className="campus-teacher__recursos-card-head">
                  <div>
                    <h3>Solicitar recursos para el periodo</h3>
                    <p>Completa cada actividad de Bienestar y agrégala a la lista antes de enviar.</p>
                  </div>
                  <label className="campus-teacher__recursos-check">
                    <input
                      checked={Boolean(draft.noMaterialsNeeded)}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        onDraftChange('noMaterialsNeeded', checked);
                        if (checked) {
                          setActivities([]);
                          setDraft((current) => ({
                            ...current,
                            noMaterialsNeeded: true,
                            pendingMaterials: [],
                            materialKey: '',
                            customMaterialName: '',
                            quantity: '1',
                          }));
                        }
                      }}
                      type="checkbox"
                    />
                    <span>No necesito material para este periodo</span>
                  </label>
                </div>

                {!draft.noMaterialsNeeded ? (
                  <>
                    <div className="campus-teacher__recursos-fields">
                      <label className="campus-teacher__recursos-field">
                        <span>Área</span>
                        <div className="campus-teacher__recursos-input-shell is-plain">
                          <input disabled value={AREA_LABEL} />
                        </div>
                      </label>

                      <label className="campus-teacher__recursos-field">
                        <span>Material</span>
                        <div className="campus-teacher__recursos-input-shell">
                          <select
                            value={draft.materialKey}
                            onChange={(event) => onDraftChange('materialKey', event.target.value)}
                          >
                            <option value="">Seleccionar material</option>
                            {materialOptions.map((material) => (
                              <option key={material} value={material}>{material}</option>
                            ))}
                            <option value="__other__">Otro</option>
                          </select>
                        </div>
                      </label>

                      <label className="campus-teacher__recursos-field is-qty">
                        <span>Cantidad</span>
                        <div className="campus-teacher__recursos-input-shell is-plain">
                          <input
                            min="1"
                            type="number"
                            value={draft.quantity}
                            onChange={(event) => onDraftChange('quantity', event.target.value)}
                          />
                        </div>
                      </label>
                    </div>

                    {draft.materialKey === '__other__' ? (
                      <label className="campus-teacher__recursos-field is-wide">
                        <span>Nombre del material</span>
                        <div className="campus-teacher__recursos-input-shell is-plain">
                          <input
                            placeholder="Escribe el material"
                            value={draft.customMaterialName}
                            onChange={(event) => onDraftChange('customMaterialName', event.target.value)}
                          />
                        </div>
                      </label>
                    ) : null}

                    <div className="campus-teacher__recursos-add-row">
                      <button className="campus-teacher__recursos-secondary" onClick={onAddMaterial} type="button">
                        + Agregar material a esta actividad
                      </button>
                    </div>

                    {(draft.pendingMaterials || []).length > 0 ? (
                      <div className="campus-teacher__recursos-pending-materials">
                        <div className="campus-teacher__recursos-pending-materials__head">
                          <strong>Materiales de la actividad</strong>
                          <span>{draft.pendingMaterials.length}</span>
                        </div>
                        <ul>
                          {draft.pendingMaterials.map((item) => (
                            <li key={item.key}>
                              <span>{item.materialName} ×{item.quantity}</span>
                              <button
                                aria-label={`Quitar ${item.materialName}`}
                                className="campus-teacher__recursos-delete"
                                onClick={() => onRemovePendingMaterial(item.key)}
                                type="button"
                              >
                                <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                                  <path d="M5 7h14M10 11v6M14 11v6M9 7l1-2h4l1 2M8 7l1 12h6l1-12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
                                </svg>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="campus-panel__meta">
                        Puedes agregar varios materiales a la misma actividad antes de guardarla.
                      </p>
                    )}

                    <label className="campus-teacher__recursos-field is-wide">
                      <span>Título de actividad</span>
                      <div className="campus-teacher__recursos-input-shell is-plain">
                        <input
                          placeholder="Ej. Taller de regulación emocional"
                          value={draft.activityTitle}
                          onChange={(event) => onDraftChange('activityTitle', event.target.value)}
                        />
                      </div>
                    </label>

                    <label className="campus-teacher__recursos-field is-wide">
                      <span>Motivo / propósito</span>
                      <div className="campus-teacher__recursos-textarea-shell">
                        <textarea
                          placeholder="Actividad, taller o necesidad de acompañamiento"
                          rows={3}
                          value={draft.purpose}
                          onChange={(event) => onDraftChange('purpose', event.target.value)}
                        />
                      </div>
                    </label>

                    <div className="campus-teacher__recursos-date-row">
                      <label className="campus-teacher__recursos-field">
                        <span>Fecha de la actividad</span>
                        <div className="campus-teacher__recursos-input-shell">
                          {(() => {
                            const minDate = toDateInputValue(selectedCycle.startDate);
                            const maxDate = toDateInputValue(selectedCycle.endDate);
                            const hasInvalidRange = Boolean(minDate && maxDate && minDate > maxDate);
                            return (
                              <input
                                disabled={hasInvalidRange}
                                max={hasInvalidRange ? undefined : (maxDate || undefined)}
                                min={hasInvalidRange ? undefined : (minDate || undefined)}
                                type="date"
                                value={draft.activityDate}
                                onChange={(event) => onDraftChange('activityDate', event.target.value)}
                              />
                            );
                          })()}
                        </div>
                      </label>
                      <div className="campus-teacher__recursos-range">
                        <span>Rango permitido</span>
                        <strong>{formatDateLabel(selectedCycle.startDate)} – {formatDateLabel(selectedCycle.endDate)}</strong>
                      </div>
                    </div>

                    <div className="campus-teacher__recursos-add-row">
                      <button className="campus-teacher__action-btn campus-teacher__recursos-add" onClick={onAddActivity} type="button">
                        + Agregar actividad
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="campus-panel__meta">
                    Confirmaste que no necesitas material. Envía el planner para notificar a coordinación.
                  </p>
                )}
              </section>

              {!draft.noMaterialsNeeded ? (
                <section className="campus-teacher__recursos-card">
                  <div className="campus-teacher__recursos-card-head">
                    <h3>Actividades solicitadas</h3>
                    <span className="campus-teacher__recursos-count">{activities.length}</span>
                  </div>
                  <div className="campus-teacher__recursos-table-wrap">
                    <table className="campus-teacher__recursos-table">
                      <thead>
                        <tr>
                          <th>Área</th>
                          <th>Materiales</th>
                          <th>Actividad</th>
                          <th>Fecha</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activities.length === 0 ? (
                          <tr>
                            <td colSpan={5}>Aún no has agregado actividades para este planner.</td>
                          </tr>
                        ) : activities.map((activity) => (
                          <tr key={activity.key}>
                            <td>{activity.subject}</td>
                            <td>{formatMaterialsLabel(activity)}</td>
                            <td>
                              <strong>{activity.title}</strong>
                              {activity.purpose ? <small>{activity.purpose}</small> : null}
                            </td>
                            <td>{formatDateLabel(activity.date)}</td>
                            <td>
                              <button
                                aria-label="Quitar actividad"
                                className="campus-teacher__recursos-delete"
                                onClick={() => onRemoveActivity(activity.key)}
                                type="button"
                              >
                                <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                                  <path d="M5 7h14M10 11v6M14 11v6M9 7l1-2h4l1 2M8 7l1 12h6l1-12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
                                </svg>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : null}

              <div className="campus-teacher__recursos-footer">
                <button
                  className="campus-teacher__recursos-secondary"
                  disabled={loading || refreshing}
                  onClick={() => loadData({ silent: true })}
                  type="button"
                >
                  Actualizar planner
                </button>
                <button
                  className="campus-teacher__action-btn campus-teacher__recursos-submit"
                  disabled={submitting || (!draft.noMaterialsNeeded && activities.length === 0)}
                  onClick={() => setConfirmOpen(true)}
                  type="button"
                >
                  {submitting
                    ? 'Enviando...'
                    : (selectedRequest?.status === 'returned_for_correction'
                      ? 'Corregir y reenviar'
                      : (selectedRequest ? 'Actualizar y enviar' : 'Enviar planner'))}
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : (!loading && cycles.length > 0) ? (
        <p className="campus-panel__meta">Selecciona un periodo para solicitar materiales.</p>
      ) : null}

      {confirmOpen ? (
        <div className="campus-teacher__recursos-modal" role="dialog" aria-modal="true">
          <div className="campus-teacher__recursos-modal-card">
            <h4>¿Confirmas el envío?</h4>
            <p>
              {draft.noMaterialsNeeded
                ? '¿Confirmas que no necesitas material para este rango de fechas?'
                : '¿Esta es toda la solicitud de materiales que necesitas para este rango de fechas?'}
            </p>
            <div className="campus-teacher__recursos-modal-actions">
              <button className="campus-teacher__recursos-secondary" onClick={() => setConfirmOpen(false)} type="button">
                Revisar otra vez
              </button>
              <button className="campus-teacher__action-btn" disabled={submitting} onClick={onSubmit} type="button">
                Sí, enviar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}
