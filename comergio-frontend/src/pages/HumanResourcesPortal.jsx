import { useEffect, useMemo, useState } from 'react';
import {
  acceptHrPurchasingRequest,
  approveHrSupplyRequest,
  createHrSupplyItem,
  createHrSupplyRequest,
  deliverHrSupplyRequest,
  getHrDashboard,
  getHrSupplyItems,
  getHrSupplyRequests,
  rejectHrSupplyRequest,
  submitHrSupplyRequestForApproval,
} from '../services/hr.service';
import useAuthStore from '../store/auth.store';

const categoryOptions = [
  { value: 'stationery', label: 'Papeleria' },
  { value: 'classroom', label: 'Aula' },
  { value: 'sports', label: 'Deportes' },
  { value: 'technology', label: 'Tecnologia' },
  { value: 'laboratory', label: 'Laboratorio' },
  { value: 'music', label: 'Musica' },
  { value: 'maintenance', label: 'Mantenimiento' },
  { value: 'other', label: 'Otros' },
];

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
  pending_purchasing_review: 'Gestión de compras',
  pending_approval: 'Pendiente',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  delivered: 'Entregada',
  partially_delivered: 'Parcial',
  cancelled: 'Cancelada',
};

const roleCanManageInventory = ['human_resources', 'admin', 'rectoria', 'direccion'];
const roleCanSubmitApproval = ['human_resources', 'admin'];
const roleCanApprove = ['rectoria', 'direccion', 'admin'];
const roleCanDeliver = ['human_resources', 'admin'];
const roleCanAcceptPurchasing = ['human_resources', 'admin'];

const emptyItemForm = {
  name: '',
  category: 'stationery',
  itemType: 'consumable',
  unit: 'unidad',
  sku: '',
  stock: 0,
  minStock: 0,
  location: '',
  notes: '',
};

const emptyRequestForm = {
  requestType: 'material',
  requestedForArea: '',
  purpose: '',
  priority: 'medium',
  itemId: '',
  quantity: 1,
};

function formatDate(value) {
  if (!value) return 'Sin fecha';
  return new Date(value).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

function getRequestItemsLabel(request) {
  return (request.items || [])
    .map((entry) => `${entry.item?.name || entry.customName || 'Material'} x${entry.quantity}`)
    .join(', ');
}

function HumanResourcesPortal() {
  const { user } = useAuthStore();
  const isManager = roleCanManageInventory.includes(user?.role);
  const canSubmitApproval = roleCanSubmitApproval.includes(user?.role);
  const canApprove = roleCanApprove.includes(user?.role);
  const canDeliver = roleCanDeliver.includes(user?.role);
  const canAcceptPurchasing = roleCanAcceptPurchasing.includes(user?.role);
  const isTeacher = user?.role === 'teacher';

  const [dashboard, setDashboard] = useState(null);
  const [items, setItems] = useState([]);
  const [requests, setRequests] = useState([]);
  const [itemForm, setItemForm] = useState(emptyItemForm);
  const [requestForm, setRequestForm] = useState(emptyRequestForm);
  const [requestItems, setRequestItems] = useState([]);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const lowStockItems = useMemo(() => items.filter((item) => item.lowStock), [items]);
  const activeItems = useMemo(() => items.filter((item) => item.status === 'active'), [items]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [itemsResponse, requestsResponse, dashboardResponse] = await Promise.all([
        getHrSupplyItems({ status: 'active' }),
        getHrSupplyRequests(selectedStatus ? { status: selectedStatus } : {}),
        isManager ? getHrDashboard() : Promise.resolve({ data: null }),
      ]);

      setItems(itemsResponse.data?.items || []);
      setRequests(requestsResponse.data?.requests || []);
      setDashboard(dashboardResponse.data || null);
    } catch (error) {
      setMessage(error?.response?.data?.message || 'No se pudo cargar recursos y gestion de compras.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedStatus]);

  const onCreateItem = async (event) => {
    event.preventDefault();
    if (!itemForm.name.trim()) {
      setMessage('Escribe el nombre del material.');
      return;
    }

    setSubmitting(true);
    try {
      await createHrSupplyItem({
        ...itemForm,
        stock: Number(itemForm.stock || 0),
        minStock: Number(itemForm.minStock || 0),
      });
      setItemForm(emptyItemForm);
      setMessage('Material guardado en inventario.');
      await loadData();
    } catch (error) {
      setMessage(error?.response?.data?.message || 'No se pudo guardar el material.');
    } finally {
      setSubmitting(false);
    }
  };

  const onAddRequestItem = () => {
    const selectedItem = items.find((item) => item.id === requestForm.itemId);
    const quantity = Math.max(1, Number(requestForm.quantity || 0));

    if (!selectedItem) {
      setMessage('Selecciona un material.');
      return;
    }

    setRequestItems((current) => {
      const existing = current.find((entry) => entry.itemId === selectedItem.id);
      if (existing) {
        return current.map((entry) =>
          entry.itemId === selectedItem.id ? { ...entry, quantity: entry.quantity + quantity } : entry
        );
      }
      return [...current, { itemId: selectedItem.id, name: selectedItem.name, unit: selectedItem.unit, quantity }];
    });
    setRequestForm((current) => ({ ...current, itemId: '', quantity: 1 }));
  };

  const onCreateRequest = async (event) => {
    event.preventDefault();
    if (!requestItems.length) {
      setMessage('Agrega al menos un material a la solicitud.');
      return;
    }

    setSubmitting(true);
    try {
      await createHrSupplyRequest({
        requestType: requestForm.requestType,
        requestedForArea: requestForm.requestedForArea,
        purpose: requestForm.purpose,
        priority: requestForm.priority,
        items: requestItems.map((entry) => ({ itemId: entry.itemId, quantity: entry.quantity })),
      });
      setRequestForm(emptyRequestForm);
      setRequestItems([]);
      setMessage(isTeacher ? 'Solicitud enviada a revision de RRHH.' : 'Solicitud enviada para aprobacion.');
      await loadData();
    } catch (error) {
      setMessage(error?.response?.data?.message || 'No se pudo crear la solicitud.');
    } finally {
      setSubmitting(false);
    }
  };

  const onApprove = async (request) => {
    setSubmitting(true);
    try {
      await approveHrSupplyRequest(request.id, {
        items: (request.items || []).map((entry) => ({ requestItemId: entry.id, itemId: entry.itemId, approvedQuantity: entry.quantity })),
      });
      setMessage('Solicitud aprobada.');
      await loadData();
    } catch (error) {
      setMessage(error?.response?.data?.message || 'No se pudo aprobar la solicitud.');
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmitApproval = async (request) => {
    setSubmitting(true);
    try {
      await submitHrSupplyRequestForApproval(request.id, { reviewNotes: 'Revisada por recursos y gestion de compras' });
      setMessage('Solicitud enviada a rectoria o direccion para aprobacion.');
      await loadData();
    } catch (error) {
      setMessage(error?.response?.data?.message || 'No se pudo enviar la solicitud a aprobacion.');
    } finally {
      setSubmitting(false);
    }
  };

  const onReject = async (request) => {
    const rejectionReason = window.prompt('Motivo del rechazo');
    if (rejectionReason === null) return;

    setSubmitting(true);
    try {
      await rejectHrSupplyRequest(request.id, { rejectionReason });
      setMessage('Solicitud rechazada.');
      await loadData();
    } catch (error) {
      setMessage(error?.response?.data?.message || 'No se pudo rechazar la solicitud.');
    } finally {
      setSubmitting(false);
    }
  };

  const onDeliver = async (request) => {
    const receivedByName = window.prompt('Nombre de quien recibe', request.requestedBy?.name || '');
    if (receivedByName === null) return;

    setSubmitting(true);
    try {
      await deliverHrSupplyRequest(request.id, {
        receivedByName,
        deliveryNotes: 'Entrega registrada desde RRHH',
        items: (request.items || []).map((entry) => ({
          requestItemId: entry.id,
          itemId: entry.itemId,
          deliveredQuantity: entry.approvedQuantity || entry.quantity,
        })),
      });
      setMessage('Entrega registrada y stock actualizado.');
      await loadData();
    } catch (error) {
      setMessage(error?.response?.data?.message || 'No se pudo registrar la entrega.');
    } finally {
      setSubmitting(false);
    }
  };

  const onAcceptPurchasing = async (request) => {
    setSubmitting(true);
    try {
      await acceptHrPurchasingRequest(request.id, { deliveryNotes: 'Aceptada por Recursos y gestion de compras.' });
      setMessage('Solicitud aceptada y stock descontado.');
      await loadData();
    } catch (error) {
      setMessage(error?.response?.data?.message || 'No se pudo aceptar la solicitud.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="hr-portal">
      <header className="hr-portal__header">
        <div>
          <p className="hr-portal__eyebrow">Gestion administrativa escolar</p>
          <h1>{isTeacher ? 'Solicitud de materiales' : 'Recursos y gestion de compras'}</h1>
          <p>
            Inventario institucional, planners consolidados por coordinacion, solicitudes y reposicion de stock.
          </p>
        </div>
        <div className="hr-portal__header-actions">
          <button type="button" onClick={loadData} disabled={loading}>Actualizar</button>
        </div>
      </header>

      {message && <div className="hr-portal__notice">{message}</div>}

      {isManager && (
        <section className="hr-portal__kpis" aria-label="Resumen de recursos y gestion de compras">
          <article><span>Materiales</span><strong>{dashboard?.summary?.totalItems || items.length}</strong></article>
          <article><span>Revisión RRHH</span><strong>{dashboard?.summary?.pendingHrReviewCount || 0}</strong></article>
          <article><span>En aprobación</span><strong>{dashboard?.summary?.pendingApprovalCount || 0}</strong></article>
          <article><span>Por entregar</span><strong>{dashboard?.summary?.approvedCount || 0}</strong></article>
          <article><span>Stock bajo</span><strong>{dashboard?.summary?.lowStockCount || lowStockItems.length}</strong></article>
        </section>
      )}

      <main className="hr-portal__grid">
        <section className="hr-portal__panel hr-portal__panel--request">
          <div className="hr-portal__panel-heading">
            <div>
              <h2>{isTeacher ? 'Pedir material' : 'Crear solicitud'}</h2>
              <p>{isTeacher ? 'Tus solicitudes llegan a coordinacion antes de compras.' : 'Crea reposiciones o solicitudes internas de compra.'}</p>
            </div>
          </div>

          <form className="hr-portal__form" onSubmit={onCreateRequest}>
            {isManager && (
              <label>
                Tipo
                <select value={requestForm.requestType} onChange={(event) => setRequestForm((current) => ({ ...current, requestType: event.target.value }))}>
                  <option value="material">Entrega a docente</option>
                  <option value="replenishment">Reposicion de stock</option>
                </select>
              </label>
            )}
            <label>
              Area o curso
              <input value={requestForm.requestedForArea} onChange={(event) => setRequestForm((current) => ({ ...current, requestedForArea: event.target.value }))} placeholder="Primaria, grado 4, laboratorio..." />
            </label>
            <label>
              Prioridad
              <select value={requestForm.priority} onChange={(event) => setRequestForm((current) => ({ ...current, priority: event.target.value }))}>
                {priorityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="hr-portal__field-wide">
              Motivo
              <textarea value={requestForm.purpose} onChange={(event) => setRequestForm((current) => ({ ...current, purpose: event.target.value }))} placeholder="Actividad, clase, proyecto o motivo de reposicion" />
            </label>

            <div className="hr-portal__request-picker">
              <label>
                Material
                <select value={requestForm.itemId} onChange={(event) => setRequestForm((current) => ({ ...current, itemId: event.target.value }))}>
                  <option value="">Seleccionar</option>
                  {activeItems.map((item) => (
                    <option key={item.id} value={item.id}>{item.name} · {item.stock} {item.unit}</option>
                  ))}
                </select>
              </label>
              <label>
                Cantidad
                <input type="number" min="1" value={requestForm.quantity} onChange={(event) => setRequestForm((current) => ({ ...current, quantity: event.target.value }))} />
              </label>
              <button type="button" onClick={onAddRequestItem}>Agregar</button>
            </div>

            {requestItems.length > 0 && (
              <div className="hr-portal__chips">
                {requestItems.map((entry) => (
                  <button key={entry.itemId} type="button" onClick={() => setRequestItems((current) => current.filter((item) => item.itemId !== entry.itemId))}>
                    {entry.name} x{entry.quantity} {entry.unit}
                  </button>
                ))}
              </div>
            )}

            <button className="hr-portal__primary" type="submit" disabled={submitting}>{submitting ? 'Guardando...' : 'Enviar solicitud'}</button>
          </form>
        </section>

        {isManager && (
          <section className="hr-portal__panel">
            <div className="hr-portal__panel-heading">
              <div>
                <h2>Inventario institucional</h2>
                <p>Materiales, consumibles y activos disponibles.</p>
              </div>
            </div>

            <form className="hr-portal__form" onSubmit={onCreateItem}>
              <label>
                Nombre
                <input value={itemForm.name} onChange={(event) => setItemForm((current) => ({ ...current, name: event.target.value }))} placeholder="Cartulina, foamy, videobeam..." />
              </label>
              <label>
                Categoria
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
                <input value={itemForm.unit} onChange={(event) => setItemForm((current) => ({ ...current, unit: event.target.value }))} />
              </label>
              <label>
                Stock
                <input type="number" min="0" value={itemForm.stock} onChange={(event) => setItemForm((current) => ({ ...current, stock: event.target.value }))} />
              </label>
              <label>
                Minimo
                <input type="number" min="0" value={itemForm.minStock} onChange={(event) => setItemForm((current) => ({ ...current, minStock: event.target.value }))} />
              </label>
              <label>
                Ubicacion
                <input value={itemForm.location} onChange={(event) => setItemForm((current) => ({ ...current, location: event.target.value }))} placeholder="Bodega, sala sistemas..." />
              </label>
              <label>
                Codigo
                <input value={itemForm.sku} onChange={(event) => setItemForm((current) => ({ ...current, sku: event.target.value }))} placeholder="Opcional" />
              </label>
              <button className="hr-portal__primary" type="submit" disabled={submitting}>Guardar material</button>
            </form>

            <div className="hr-portal__inventory-list">
              {items.map((item) => (
                <article key={item.id} className={item.lowStock ? 'is-low' : ''}>
                  <div>
                    <strong>{item.name}</strong>
                    <span>{categoryOptions.find((option) => option.value === item.category)?.label || 'Otros'} · {item.itemType === 'asset' ? 'Activo' : 'Consumible'}</span>
                  </div>
                  <div>
                    <strong>{item.stock}</strong>
                    <span>{item.unit} · min {item.minStock}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>

      <section className="hr-portal__panel hr-portal__requests">
        <div className="hr-portal__panel-heading">
          <div>
            <h2>{isTeacher ? 'Mis solicitudes' : 'Solicitudes y trazabilidad'}</h2>
            <p>Historial con coordinacion, compras, entrega y responsable.</p>
          </div>
          <select value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value)}>
            <option value="">Todos los estados</option>
            {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>

        <div className="hr-portal__request-list">
          {loading ? (
            <p>Cargando solicitudes...</p>
          ) : requests.length === 0 ? (
            <p>No hay solicitudes registradas.</p>
          ) : requests.map((request) => (
            <article key={request.id} className={`hr-portal__request-card status-${request.status}`}>
              <div className="hr-portal__request-main">
                <div>
                  <span className="hr-portal__badge">{statusLabels[request.status] || request.status}</span>
                  <h3>{request.consolidatedFromRequestIds?.length ? 'Consolidado de planners docentes' : (request.requestType === 'replenishment' ? 'Reposicion de stock' : 'Solicitud de materiales')}</h3>
                  {request.plannerCycle ? <span>{request.plannerCycle.title}</span> : null}
                  <p>{getRequestItemsLabel(request)}</p>
                </div>
                <div className="hr-portal__request-meta">
                  <span>{request.requestedBy?.name || 'Usuario'}</span>
                  <span>{formatDate(request.createdAt)}</span>
                  {request.neededByDate ? <span>Necesario: {formatDate(request.neededByDate)}</span> : null}
                </div>
              </div>
              {request.purpose && <p className="hr-portal__request-purpose">{request.purpose}</p>}
              <div className="hr-portal__request-actions">
                {canApprove && request.status === 'pending_approval' && (
                  <>
                    <button type="button" onClick={() => onApprove(request)} disabled={submitting}>Aprobar</button>
                    <button type="button" className="danger" onClick={() => onReject(request)} disabled={submitting}>Rechazar</button>
                  </>
                )}
                {canSubmitApproval && request.status === 'pending_hr_review' && (
                  <button type="button" onClick={() => onSubmitApproval(request)} disabled={submitting}>Enviar a aprobación</button>
                )}
                {canAcceptPurchasing && request.status === 'pending_purchasing_review' && (
                  <button type="button" onClick={() => onAcceptPurchasing(request)} disabled={submitting}>Aceptar y descontar inventario</button>
                )}
                {canDeliver && request.status === 'approved' && (
                  <button type="button" onClick={() => onDeliver(request)} disabled={submitting}>Registrar entrega</button>
                )}
              </div>
              {(request.approvedBy || request.deliveredBy || request.rejectedBy) && (
                <div className="hr-portal__trace">
                  {request.approvedBy && <span>Aprobo: {request.approvedBy.name} · {formatDate(request.approvedAt)}</span>}
                  {request.deliveredBy && <span>Entrego: {request.deliveredBy.name} · {formatDate(request.deliveredAt)}</span>}
                  {request.rejectedBy && <span>Rechazo: {request.rejectedBy.name} · {request.rejectionReason}</span>}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export default HumanResourcesPortal;
