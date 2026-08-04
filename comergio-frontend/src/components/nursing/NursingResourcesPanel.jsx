import { useEffect, useMemo, useState } from 'react';
import {
  adjustHrSupplyItemStock,
  createHrSupplyItem,
  createHrSupplyRequest,
  getHrPurchaseAreas,
  getHrSupplyItems,
  getHrSupplyRequests,
} from '../../services/hr.service';
import '../../pages/HumanResourcesPortal.css';

const categoryOptions = [
  { value: 'nursing', label: 'Enfermería' },
  { value: 'other', label: 'Otros' },
  { value: 'stationery', label: 'Papelería' },
  { value: 'cleaning', label: 'Aseo y limpieza' },
];

const unitOptions = ['unidad', 'caja', 'paquete', 'rollo', 'galón', 'litro', 'kg', 'metro', 'par', 'juego', 'bolsa'];

const priorityOptions = [
  { value: 'low', label: 'Baja' },
  { value: 'medium', label: 'Media' },
  { value: 'high', label: 'Alta' },
  { value: 'urgent', label: 'Urgente' },
];

const statusLabels = {
  pending_coordination_review: 'Revisión coordinación',
  consolidated: 'Consolidada',
  pending_hr_review: 'Revisión RRHH',
  pending_purchasing_review: 'En Recursos',
  pending_approval: 'Pendiente aprobación',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  delivered: 'Entregada',
  partially_delivered: 'Parcial',
  cancelled: 'Cancelada',
};

const requestTypeLabels = {
  material: 'Entrega desde inventario',
  purchase: 'Compra / adquisición',
  replenishment: 'Reposición de inventario',
};

const historyFilterOptions = [
  { value: 'all', label: 'Todos' },
  { value: 'request', label: 'Solicitudes' },
  { value: 'stock_in', label: 'Ingresos' },
  { value: 'delivery', label: 'Entregas' },
];

const emptyItemForm = {
  name: '',
  category: 'nursing',
  itemType: 'consumable',
  unit: 'unidad',
  sku: '',
  stock: 0,
  minStock: 0,
  unitCost: 0,
  location: '',
  notes: '',
};

const emptyRequestForm = {
  purpose: '',
  priority: 'medium',
  neededByDate: '',
  requestedForPerson: '',
  itemId: '',
  customName: '',
  quantity: 1,
  unit: 'unidad',
  unitCost: 0,
  itemNotes: '',
};

const emptyStockForm = {
  itemId: '',
  quantity: 1,
  notes: '',
};

function formatCop(value) {
  return `$${Number(value || 0).toLocaleString('es-CO')}`;
}

function formatDate(value) {
  if (!value) return 'Sin fecha';
  return new Date(value).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

function getCategoryLabel(value) {
  return categoryOptions.find((option) => option.value === value)?.label || value || 'Otros';
}

function getRequestItemsLabel(request) {
  return (request.items || [])
    .map((entry) => `${entry.item?.name || entry.customName || 'Material'} x${entry.quantity}${entry.unit ? ` ${entry.unit}` : ''}`)
    .join(', ');
}

function mapRequestToHistoryEntry(request) {
  const isDelivered = request.status === 'delivered' || request.status === 'partially_delivered';
  let kind = 'request';
  let kindLabel = 'Solicitud';
  if (isDelivered) {
    if (request.requestType === 'material') {
      kind = 'delivery';
      kindLabel = 'Entrega de material';
    } else {
      kind = 'stock_in';
      kindLabel = 'Ingreso de inventario';
    }
  }
  const sortAt = request.deliveredAt || request.updatedAt || request.createdAt || null;
  return { request, kind, kindLabel, sortAt };
}

function IconBox() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 8.5 12 3 3 8.5v7L12 21l9-5.5v-7Z" />
      <path d="M12 12v9" />
      <path d="m3 8.5 9 3.5 9-3.5" />
    </svg>
  );
}

function IconClipboard() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 5h6" />
      <path d="M8 3h8a1 1 0 0 1 1 1v2H7V4a1 1 0 0 1 1-1Z" />
      <rect x="5" y="5" width="14" height="16" rx="2" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconStockIn() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 19h14" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function IconSend() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m4 12 16-8-6 16-2.5-6.5L4 12Z" />
    </svg>
  );
}

export default function NursingResourcesPanel({ className = '' }) {
  const [nursingArea, setNursingArea] = useState(null);
  const [items, setItems] = useState([]);
  const [requests, setRequests] = useState([]);
  const [itemForm, setItemForm] = useState(emptyItemForm);
  const [requestForm, setRequestForm] = useState(emptyRequestForm);
  const [requestItems, setRequestItems] = useState([]);
  const [stockForm, setStockForm] = useState(emptyStockForm);
  const [materialSearch, setMaterialSearch] = useState('');
  const [historyFilter, setHistoryFilter] = useState('all');
  const [activeModal, setActiveModal] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const areaId = nursingArea?.id || '';
  const lowStockItems = useMemo(
    () => items.filter((item) => Number(item.stock || 0) <= Number(item.minStock || 0)),
    [items]
  );

  const historyEntries = useMemo(() => {
    const entries = requests.map(mapRequestToHistoryEntry)
      .filter((entry) => historyFilter === 'all' || entry.kind === historyFilter)
      .sort((a, b) => new Date(b.sortAt || 0).getTime() - new Date(a.sortAt || 0).getTime());
    return entries;
  }, [requests, historyFilter]);

  const selectedRequestItem = useMemo(
    () => items.find((item) => item.id === requestForm.itemId) || null,
    [items, requestForm.itemId]
  );

  const requestEstimatedTotal = useMemo(
    () => requestItems.reduce((sum, entry) => sum + (Number(entry.quantity || 0) * Number(entry.unitCost || 0)), 0),
    [requestItems]
  );

  const closeModal = () => {
    setActiveModal(null);
    setStockForm(emptyStockForm);
  };

  const openModal = (modalKey) => {
    setMessage('');
    if (modalKey === 'create-request') {
      setRequestForm(emptyRequestForm);
      setRequestItems([]);
      setMaterialSearch('');
    }
    if (modalKey === 'create-item') {
      setItemForm(emptyItemForm);
    }
    if (modalKey === 'add-stock') {
      setStockForm(emptyStockForm);
    }
    setActiveModal(modalKey);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const areasResponse = await getHrPurchaseAreas();
      const areas = (areasResponse.data?.areas || []).filter((area) => area.status !== 'archived');
      const area = areas.find((entry) => entry.key === 'nursing') || null;
      setNursingArea(area);

      const params = area?.id ? { areaId: area.id } : {};
      const [itemsResponse, requestsResponse] = await Promise.all([
        getHrSupplyItems({ status: 'active', ...params }),
        getHrSupplyRequests(params),
      ]);
      setItems(itemsResponse.data?.items || []);
      setRequests(requestsResponse.data?.requests || []);
      if (!area) {
        setMessage('El área de Enfermería aún no está configurada en Recursos. Pide a Rectoría que active las áreas de compra.');
      }
    } catch (error) {
      setMessage(error?.response?.data?.message || 'No se pudo cargar el inventario de Enfermería.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const onCreateItem = async (event) => {
    event.preventDefault();
    if (!itemForm.name.trim()) {
      setMessage('Escribe el nombre del insumo.');
      return;
    }
    if (!areaId) {
      setMessage('El área de Enfermería no está disponible.');
      return;
    }

    setSubmitting(true);
    try {
      await createHrSupplyItem({
        ...itemForm,
        areaId,
        stock: Number(itemForm.stock || 0),
        minStock: Number(itemForm.minStock || 0),
        unitCost: Math.max(0, Number(itemForm.unitCost || 0)),
      });
      setItemForm(emptyItemForm);
      setMessage('Insumo guardado en el inventario de Enfermería.');
      closeModal();
      await loadData();
    } catch (error) {
      setMessage(error?.response?.data?.message || 'No se pudo guardar el insumo.');
    } finally {
      setSubmitting(false);
    }
  };

  const onAdjustStockIn = async (event) => {
    event.preventDefault();
    if (!stockForm.itemId) {
      setMessage('Selecciona un material del inventario.');
      return;
    }
    const quantity = Math.max(1, Number(stockForm.quantity || 0));
    setSubmitting(true);
    try {
      await adjustHrSupplyItemStock(stockForm.itemId, {
        direction: 'in',
        quantity,
        notes: String(stockForm.notes || '').trim() || undefined,
      });
      setStockForm(emptyStockForm);
      setMessage('Inventario actualizado.');
      closeModal();
      await loadData();
    } catch (error) {
      setMessage(error?.response?.data?.message || 'No se pudo agregar inventario.');
    } finally {
      setSubmitting(false);
    }
  };

  const onAddRequestItem = () => {
    const quantity = Math.max(1, Number(requestForm.quantity || 0));
    const selectedItem = items.find((item) => item.id === requestForm.itemId);
    const customName = String(requestForm.customName || materialSearch || '').trim();
    const unitCost = selectedItem
      ? Math.max(0, Number(selectedItem.unitCost || 0))
      : Math.max(0, Number(requestForm.unitCost || 0));

    if (!selectedItem && !customName) {
      setMessage('Selecciona un material del catálogo o escribe el producto a comprar.');
      return;
    }

    const nextEntry = selectedItem
      ? {
        key: `catalog-${selectedItem.id}`,
        itemId: selectedItem.id,
        customName: '',
        name: selectedItem.name,
        unit: selectedItem.unit || requestForm.unit || 'unidad',
        unitCost,
        notes: String(requestForm.itemNotes || '').trim(),
        quantity,
      }
      : {
        key: `custom-${customName.toLowerCase()}`,
        itemId: '',
        customName,
        name: customName,
        unit: requestForm.unit || 'unidad',
        unitCost,
        notes: String(requestForm.itemNotes || '').trim(),
        quantity,
      };

    setRequestItems((current) => {
      const existing = current.find((entry) => entry.key === nextEntry.key);
      if (existing) {
        return current.map((entry) =>
          entry.key === nextEntry.key
            ? {
              ...entry,
              quantity: entry.quantity + quantity,
              notes: nextEntry.notes || entry.notes,
              unitCost: nextEntry.unitCost || entry.unitCost,
            }
            : entry
        );
      }
      return [...current, nextEntry];
    });
    setRequestForm((current) => ({
      ...current,
      itemId: '',
      customName: '',
      quantity: 1,
      unit: selectedItem?.unit || current.unit || 'unidad',
      unitCost: 0,
      itemNotes: '',
    }));
    setMaterialSearch('');
  };

  const onCreateRequest = async (event) => {
    event.preventDefault();
    if (!requestItems.length) {
      setMessage('Agrega al menos un producto a la solicitud.');
      return;
    }
    if (!String(requestForm.purpose || '').trim()) {
      setMessage('Describe el motivo o justificación de la solicitud.');
      return;
    }
    if (!areaId) {
      setMessage('El área de Enfermería no está disponible.');
      return;
    }

    setSubmitting(true);
    try {
      await createHrSupplyRequest({
        requestType: 'purchase',
        serviceArea: 'nursing',
        needCategory: 'nursing',
        areaId,
        requestedForArea: 'Enfermería',
        requestedForPerson: requestForm.requestedForPerson,
        purpose: requestForm.purpose,
        priority: requestForm.priority,
        neededByDate: requestForm.neededByDate || null,
        items: requestItems.map((entry) => ({
          itemId: entry.itemId || undefined,
          customName: entry.customName || undefined,
          quantity: entry.quantity,
          unit: entry.unit,
          unitCost: Math.max(0, Number(entry.unitCost || 0)),
          notes: entry.notes,
        })),
      });
      setRequestForm(emptyRequestForm);
      setRequestItems([]);
      setMaterialSearch('');
      setMessage('Solicitud enviada a Recursos (área Enfermería).');
      closeModal();
      await loadData();
    } catch (error) {
      setMessage(error?.response?.data?.message || 'No se pudo enviar la solicitud.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderModal = () => {
    if (!activeModal) return null;

    const titles = {
      'create-item': 'Crear insumo',
      'add-stock': 'Registrar inventario',
      'create-request': 'Solicitar a Recursos',
    };

    return (
      <div className="hr-portal__modal" role="dialog" aria-modal="true" aria-label={titles[activeModal]}>
        <button className="hr-portal__modal-backdrop" type="button" aria-label="Cerrar" onClick={closeModal} />
        <div className="hr-portal__modal-panel">
          <div className="hr-portal__modal-header">
            <h2>{titles[activeModal]}</h2>
            <button className="hr-portal__modal-close" type="button" aria-label="Cerrar" onClick={closeModal}>
              <IconClose />
            </button>
          </div>

          {activeModal === 'create-item' ? (
            <form className="hr-portal__form" onSubmit={onCreateItem}>
              <label>
                Nombre
                <input
                  value={itemForm.name}
                  onChange={(event) => setItemForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Gasas, alcohol, termómetro..."
                />
              </label>
              <label>
                Categoría
                <select value={itemForm.category} onChange={(event) => setItemForm((current) => ({ ...current, category: event.target.value }))}>
                  {categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label>
                Tipo
                <select value={itemForm.itemType} onChange={(event) => setItemForm((current) => ({ ...current, itemType: event.target.value }))}>
                  <option value="consumable">Consumible</option>
                  <option value="asset">Activo</option>
                </select>
              </label>
              <label>
                Unidad
                <select value={itemForm.unit} onChange={(event) => setItemForm((current) => ({ ...current, unit: event.target.value }))}>
                  {unitOptions.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                </select>
              </label>
              <label>
                Stock inicial
                <input type="number" min="0" value={itemForm.stock} onChange={(event) => setItemForm((current) => ({ ...current, stock: event.target.value }))} />
              </label>
              <label>
                Mínimo
                <input type="number" min="0" value={itemForm.minStock} onChange={(event) => setItemForm((current) => ({ ...current, minStock: event.target.value }))} />
              </label>
              <label>
                Costo unitario
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={itemForm.unitCost}
                  onChange={(event) => setItemForm((current) => ({ ...current, unitCost: event.target.value }))}
                  placeholder="0"
                />
              </label>
              <label>
                Ubicación
                <input
                  value={itemForm.location}
                  onChange={(event) => setItemForm((current) => ({ ...current, location: event.target.value }))}
                  placeholder="Botiquín, armario..."
                />
              </label>
              <div className="hr-portal__form-actions">
                <button className="hr-portal__btn hr-portal__btn--ghost" type="button" onClick={closeModal} disabled={submitting}>Cancelar</button>
                <button className="hr-portal__btn hr-portal__btn--blue" type="submit" disabled={submitting || !areaId}>
                  <IconPlus />
                  {submitting ? 'Guardando...' : 'Crear insumo'}
                </button>
              </div>
            </form>
          ) : null}

          {activeModal === 'add-stock' ? (
            <form className="hr-portal__form hr-portal__form--single" onSubmit={onAdjustStockIn}>
              <label>
                Material
                <select value={stockForm.itemId} onChange={(event) => setStockForm((current) => ({ ...current, itemId: event.target.value }))}>
                  <option value="">Selecciona un material</option>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · stock {item.stock} {item.unit}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Cantidad a ingresar
                <input type="number" min="1" value={stockForm.quantity} onChange={(event) => setStockForm((current) => ({ ...current, quantity: event.target.value }))} />
              </label>
              <label>
                Notas (opcional)
                <input value={stockForm.notes} onChange={(event) => setStockForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Compra, donación, ajuste..." />
              </label>
              <div className="hr-portal__form-actions">
                <button className="hr-portal__btn hr-portal__btn--ghost" type="button" onClick={closeModal} disabled={submitting}>Cancelar</button>
                <button className="hr-portal__btn hr-portal__btn--blue" type="submit" disabled={submitting || !items.length}>
                  <IconStockIn />
                  {submitting ? 'Guardando...' : 'Registrar inventario'}
                </button>
              </div>
            </form>
          ) : null}

          {activeModal === 'create-request' ? (
            <form className="hr-portal__form" onSubmit={onCreateRequest}>
              <p className="hr-portal__empty" style={{ marginTop: 0 }}>
                Esta solicitud llega directamente a Recursos en la pestaña Enfermería.
              </p>
              <label>
                Motivo / justificación
                <textarea
                  value={requestForm.purpose}
                  onChange={(event) => setRequestForm((current) => ({ ...current, purpose: event.target.value }))}
                  placeholder="Por qué se necesita la compra..."
                  rows={3}
                />
              </label>
              <label>
                Prioridad
                <select value={requestForm.priority} onChange={(event) => setRequestForm((current) => ({ ...current, priority: event.target.value }))}>
                  {priorityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label>
                Fecha necesaria
                <input type="date" value={requestForm.neededByDate} onChange={(event) => setRequestForm((current) => ({ ...current, neededByDate: event.target.value }))} />
              </label>
              <label>
                Solicitado por / para
                <input
                  value={requestForm.requestedForPerson}
                  onChange={(event) => setRequestForm((current) => ({ ...current, requestedForPerson: event.target.value }))}
                  placeholder="Opcional"
                />
              </label>

              <div className="hr-portal__picker">
                <label className="hr-portal__picker-search">
                  <span>Producto</span>
                  <input
                    list="nursing-resource-items"
                    value={selectedRequestItem ? selectedRequestItem.name : materialSearch}
                    onChange={(event) => {
                      const value = event.target.value;
                      const match = items.find((item) => item.name === value);
                      if (match) {
                        setRequestForm((current) => ({
                          ...current,
                          itemId: match.id,
                          customName: '',
                          unit: match.unit || 'unidad',
                          unitCost: match.unitCost || 0,
                        }));
                        setMaterialSearch(match.name);
                      } else {
                        setRequestForm((current) => ({
                          ...current,
                          itemId: '',
                          customName: value,
                          unitCost: current.itemId ? 0 : current.unitCost,
                        }));
                        setMaterialSearch(value);
                      }
                    }}
                    placeholder="Busca en catálogo o escribe uno nuevo"
                  />
                  <datalist id="nursing-resource-items">
                    {items.map((item) => (
                      <option key={item.id} value={item.name}>
                        {item.stock} {item.unit} · {formatCop(item.unitCost)}
                      </option>
                    ))}
                  </datalist>
                </label>
                <label className="hr-portal__picker-qty">
                  <span>Cantidad</span>
                  <input type="number" min="1" value={requestForm.quantity} onChange={(event) => setRequestForm((current) => ({ ...current, quantity: event.target.value }))} />
                </label>
                <label className="hr-portal__picker-unit">
                  <span>Unidad</span>
                  <select
                    value={selectedRequestItem?.unit || requestForm.unit || 'unidad'}
                    onChange={(event) => setRequestForm((current) => ({ ...current, unit: event.target.value }))}
                    disabled={Boolean(selectedRequestItem)}
                  >
                    {[selectedRequestItem?.unit, ...unitOptions].filter(Boolean).filter((value, index, list) => list.indexOf(value) === index).map((unit) => (
                      <option key={unit} value={unit}>{unit}</option>
                    ))}
                  </select>
                </label>
                {!selectedRequestItem ? (
                  <label className="hr-portal__picker-cost">
                    <span>Costo unitario</span>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={requestForm.unitCost}
                      onChange={(event) => setRequestForm((current) => ({ ...current, unitCost: event.target.value }))}
                      placeholder="0"
                    />
                  </label>
                ) : null}
                <button className="hr-portal__add-item" type="button" onClick={onAddRequestItem}>
                  <IconPlus />
                  Agregar
                </button>
              </div>

              {requestItems.length > 0 ? (
                <>
                  <div className="hr-portal__chips">
                    {requestItems.map((entry) => (
                      <button key={entry.key} type="button" onClick={() => setRequestItems((current) => current.filter((item) => item.key !== entry.key))}>
                        {entry.name} x{entry.quantity} {entry.unit}
                        {Number(entry.unitCost) > 0 ? ` · ${formatCop(entry.unitCost)}` : ''}
                        {entry.itemId ? '' : ' · compra'}
                      </button>
                    ))}
                  </div>
                  <p className="hr-portal__request-total">
                    Total estimado: <strong>{formatCop(requestEstimatedTotal)}</strong>
                  </p>
                </>
              ) : (
                <p className="hr-portal__empty">Agrega gasas, alcohol, jeringas u otros insumos médicos.</p>
              )}

              <div className="hr-portal__form-actions">
                <button className="hr-portal__btn hr-portal__btn--ghost" type="button" onClick={closeModal} disabled={submitting}>Cancelar</button>
                <button className="hr-portal__btn hr-portal__btn--green" type="submit" disabled={submitting || !areaId}>
                  <IconSend />
                  {submitting ? 'Enviando...' : 'Enviar a Recursos'}
                </button>
              </div>
            </form>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div className={`hr-portal ${className}`.trim()}>
      {message ? <div className="hr-portal__notice">{message}</div> : null}

      <section className="nursing-hero-banner">
        <div>
          <h1>Recursos · Enfermería</h1>
          <p>
            Crea insumos, registra inventario y solicita compras. Las solicitudes llegan directamente al portal de Recursos en el área Enfermería.
          </p>
        </div>
        <button type="button" className="hr-portal__btn hr-portal__btn--ghost" onClick={loadData} disabled={loading}>
          {loading ? 'Cargando...' : 'Actualizar'}
        </button>
      </section>

      <section className="hr-portal__kpis" aria-label="Resumen de inventario de enfermería">
        <article className="hr-portal__kpi">
          <span className="hr-portal__kpi-icon is-blue" aria-hidden="true"><IconBox /></span>
          <div className="hr-portal__kpi-copy">
            <span>Materiales</span>
            <strong>{items.length}</strong>
            <small>En inventario</small>
          </div>
        </article>
        <article className="hr-portal__kpi">
          <span className="hr-portal__kpi-icon is-red" aria-hidden="true"><IconBox /></span>
          <div className="hr-portal__kpi-copy">
            <span>Stock bajo</span>
            <strong>{lowStockItems.length}</strong>
            <small>Por reponer</small>
          </div>
        </article>
        <article className="hr-portal__kpi">
          <span className="hr-portal__kpi-icon is-green" aria-hidden="true"><IconClipboard /></span>
          <div className="hr-portal__kpi-copy">
            <span>Solicitudes</span>
            <strong>{requests.filter((request) => request.status === 'pending_purchasing_review').length}</strong>
            <small>En Recursos</small>
          </div>
        </article>
      </section>

      <section className="hr-portal__actions" aria-label="Acciones de recursos">
        <button type="button" className="hr-portal__action-btn is-blue" onClick={() => openModal('create-item')} disabled={!areaId}>
          <span className="hr-portal__action-icon" aria-hidden="true"><IconPlus /></span>
          <span>Crear insumo</span>
        </button>
        <button type="button" className="hr-portal__action-btn is-amber" onClick={() => openModal('add-stock')} disabled={!areaId}>
          <span className="hr-portal__action-icon" aria-hidden="true"><IconStockIn /></span>
          <span>Registrar inventario</span>
        </button>
        <button type="button" className="hr-portal__action-btn is-green" onClick={() => openModal('create-request')} disabled={!areaId}>
          <span className="hr-portal__action-icon" aria-hidden="true"><IconSend /></span>
          <span>Solicitar a Recursos</span>
        </button>
      </section>

      <section className="hr-portal__panel hr-portal__inventory">
        <div className="hr-portal__panel-heading">
          <div className="hr-portal__panel-heading-main">
            <span className="hr-portal__panel-icon is-blue" aria-hidden="true"><IconBox /></span>
            <div>
              <h2>Inventario · Enfermería</h2>
              <p>Catálogo, stock y costo unitario de esta área.</p>
            </div>
          </div>
        </div>

        {loading ? (
          <p className="hr-portal__inventory-empty">Cargando inventario...</p>
        ) : items.length === 0 ? (
          <p className="hr-portal__inventory-empty">Todavía no hay materiales en el inventario de Enfermería.</p>
        ) : (
          <div className="hr-portal__inventory-table-wrap">
            <table className="hr-portal__inventory-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Nombre</th>
                  <th>Categoría</th>
                  <th>Tipo</th>
                  <th>Unidad</th>
                  <th>Stock</th>
                  <th>Mínimo</th>
                  <th>Costo</th>
                  <th>Ubicación</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={item.id} className={item.lowStock ? 'is-low' : ''}>
                    <td className="is-muted">{index + 1}</td>
                    <td><strong>{item.name}</strong></td>
                    <td>{getCategoryLabel(item.category)}</td>
                    <td>{item.itemType === 'asset' ? 'Activo' : 'Consumible'}</td>
                    <td>{item.unit}</td>
                    <td><strong>{item.stock}</strong></td>
                    <td>{item.minStock}</td>
                    <td>{formatCop(item.unitCost)}</td>
                    <td className="is-muted">{item.location || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="hr-portal__panel hr-portal__history">
        <div className="hr-portal__panel-heading">
          <div className="hr-portal__panel-heading-main">
            <span className="hr-portal__panel-icon is-blue" aria-hidden="true"><IconClipboard /></span>
            <div>
              <h2>Historial · Enfermería</h2>
              <p>Solicitudes enviadas a Recursos, ingresos y movimientos del área.</p>
            </div>
          </div>
          <div className="hr-portal__filter-chips" role="tablist" aria-label="Filtrar historial">
            {historyFilterOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={historyFilter === option.value ? 'is-active' : ''}
                onClick={() => setHistoryFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {historyEntries.length === 0 ? (
          <p className="hr-portal__empty">No hay movimientos registrados en esta área.</p>
        ) : (
          historyEntries.map(({ request, kind, kindLabel }) => (
            <article key={request.id} className="hr-portal__history-card">
              <div className="hr-portal__history-main">
                <div>
                  <div className="hr-portal__history-badges">
                    <span className={`hr-portal__kind-badge is-${kind === 'request' ? 'request' : kind === 'stock_in' ? 'stock' : 'delivery'}`}>
                      {kindLabel}
                    </span>
                    <span className="hr-portal__badge">{statusLabels[request.status] || request.status}</span>
                  </div>
                  <h3>{requestTypeLabels[request.requestType] || 'Solicitud'}</h3>
                  <p>{getRequestItemsLabel(request)}</p>
                  {request.purpose ? <p className="hr-portal__request-purpose">{request.purpose}</p> : null}
                  <p className="hr-portal__request-context">
                    {[request.requestedForPerson, request.requestedBy?.name].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="hr-portal__request-meta">
                  <span>{formatDate(request.createdAt)}</span>
                  {Number(request.estimatedTotal) > 0 ? <strong>{formatCop(request.estimatedTotal)}</strong> : null}
                </div>
              </div>
            </article>
          ))
        )}
      </section>

      {renderModal()}
    </div>
  );
}
