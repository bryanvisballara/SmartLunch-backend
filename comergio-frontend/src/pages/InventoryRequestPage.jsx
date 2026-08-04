import { useEffect, useMemo, useState } from 'react';
import {
  createInventoryRequest,
  createInventorySupplier,
  getInventoryRequests,
  getInventorySuppliers,
} from '../services/inventory.service';
import { getProducts } from '../services/products.service';
import { getStores } from '../services/stores.service';
import useAuthStore from '../store/auth.store';
import DismissibleNotice from '../components/DismissibleNotice';

const modeTitle = {
  in: 'ingresos',
  out: 'egresos',
  transfer: 'traslados',
};

const formatCurrency = (value) => `$${Number(value || 0).toLocaleString('es-CO')}`;

function InventoryRequestPage({ mode }) {
  const { currentStore, setCurrentStore, user } = useAuthStore();
  const isVendorTransfer = mode === 'transfer' && user?.role === 'vendor';
  const isIncomeMode = mode === 'in';
  const [products, setProducts] = useState([]);
  const [stores, setStores] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [sourceStoreId, setSourceStoreId] = useState('');
  const [requestItems, setRequestItems] = useState([]);
  const [currentItem, setCurrentItem] = useState({ productId: '', quantity: '1', productQuery: '', showOptions: false });
  const [targetStoreId, setTargetStoreId] = useState('');
  const [observations, setObservations] = useState('');
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [creatingSupplier, setCreatingSupplier] = useState(false);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [historyRequests, setHistoryRequests] = useState([]);
  const [expandedHistoryBatchKeys, setExpandedHistoryBatchKeys] = useState([]);
  const [message, setMessage] = useState('');
  const [successModal, setSuccessModal] = useState({ open: false, fading: false });
  const [submitting, setSubmitting] = useState(false);

  const formatDateTime = (value) => (value ? new Date(value).toLocaleString('es-CO') : 'N/A');

  useEffect(() => {
    const load = async () => {
      try {
        const storesRes = await getStores();
        const storesData = storesRes.data || [];
        setStores(storesData);

        const assignedStoreId = String(user?.assignedStore?._id || user?.assignedStoreId || '');
        const assignedStoreFromList = assignedStoreId
          ? storesData.find((store) => String(store._id) === assignedStoreId) || null
          : null;

        const nextStore =
          assignedStoreFromList ||
          user?.assignedStore ||
          currentStore ||
          storesData[0] ||
          null;

        if (nextStore && String(currentStore?._id || '') !== String(nextStore?._id || '')) {
          setCurrentStore(nextStore);
        }

        const productsRes = await getProducts({
          includeInactive: 'true',
          ...(nextStore?._id ? { storeId: String(nextStore._id) } : {}),
        });
        setProducts(productsRes.data || []);

        if (mode === 'in') {
          const suppliersRes = await getInventorySuppliers();
          setSuppliers(suppliersRes.data || []);
        }
      } catch (error) {
        setMessage(error?.response?.data?.message || 'No se pudo cargar inventario');
      }
    };

    load();
  }, [currentStore?._id, mode, setCurrentStore, user?.role, user?.assignedStore?._id, user?.assignedStoreId]);

  useEffect(() => {
    if (!successModal.open) {
      return undefined;
    }

    const fadeTimer = setTimeout(() => {
      setSuccessModal((prev) => ({ ...prev, fading: true }));
    }, 2700);

    const closeTimer = setTimeout(() => {
      setSuccessModal({ open: false, fading: false });
    }, 3000);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(closeTimer);
    };
  }, [successModal.open]);

  const loadRequestsData = async () => {
    try {
      const [pendingResponse, approvedResponse, rejectedResponse] = await Promise.all([
        getInventoryRequests({ status: 'pending', type: mode }),
        getInventoryRequests({ status: 'approved', type: mode }),
        getInventoryRequests({ status: 'rejected', type: mode }),
      ]);

      setPendingRequests(pendingResponse.data || []);
      setHistoryRequests([...(approvedResponse.data || []), ...(rejectedResponse.data || [])]);
    } catch (error) {
      setPendingRequests([]);
      setHistoryRequests([]);
    }
  };

  useEffect(() => {
    loadRequestsData();
    const intervalId = setInterval(loadRequestsData, 12000);
    return () => clearInterval(intervalId);
  }, [mode]);

  const storeProducts = useMemo(() => {
    const activeStoreId = mode === 'transfer'
      ? (isVendorTransfer ? currentStore?._id : sourceStoreId)
      : currentStore?._id;
    if (!activeStoreId) {
      return [];
    }

    return products.filter((product) => String(product.storeId) === String(activeStoreId));
  }, [products, currentStore?._id, mode, sourceStoreId, isVendorTransfer]);

  const sourceStore = useMemo(() => {
    if (mode !== 'transfer') {
      return currentStore || null;
    }

    if (isVendorTransfer) {
      return currentStore || null;
    }

    return stores.find((store) => String(store._id) === String(sourceStoreId)) || null;
  }, [currentStore, mode, sourceStoreId, stores, isVendorTransfer]);

  const targetStores = useMemo(() => {
    const activeSourceStoreId = mode === 'transfer'
      ? (isVendorTransfer ? currentStore?._id : sourceStoreId)
      : currentStore?._id;
    if (!activeSourceStoreId) {
      return stores;
    }
    return stores.filter((store) => String(store._id) !== String(activeSourceStoreId));
  }, [stores, currentStore?._id, mode, sourceStoreId, isVendorTransfer]);

  useEffect(() => {
    if (!isVendorTransfer) {
      return;
    }

    // For vendors, the transfer source is always their assigned/current store.
    if (String(sourceStoreId || '') !== String(currentStore?._id || '')) {
      setSourceStoreId(String(currentStore?._id || ''));
    }
  }, [currentStore?._id, isVendorTransfer, sourceStoreId]);

  useEffect(() => {
    if (mode !== 'transfer') {
      return;
    }

    if (!targetStoreId) {
      return;
    }

    if (String(targetStoreId) === String(sourceStoreId)) {
      setTargetStoreId('');
    }
  }, [mode, sourceStoreId, targetStoreId]);

  const groupedPendingRequests = useMemo(
    () =>
      Object.values(
        pendingRequests.reduce((accumulator, request) => {
          const key = request.batchId || request._id;
          if (!accumulator[key]) {
            accumulator[key] = {
              key,
              notes: request.notes || '',
              requestedBy: request.requestedBy,
              store: request.storeId,
              targetStore: request.targetStoreId,
              createdAt: request.createdAt,
              invoiceAmount: request.invoiceAmount,
              supplierName: request.supplierName || request.supplierId?.name || '',
              requests: [],
            };
          }
          accumulator[key].requests.push(request);
          return accumulator;
        }, {})
      ),
    [pendingRequests]
  );

  const groupedHistoryRequests = useMemo(
    () =>
      Object.values(
        historyRequests.reduce((accumulator, request) => {
          const key = request.batchId || request._id;
          if (!accumulator[key]) {
            accumulator[key] = {
              key,
              status: request.status,
              notes: request.notes || '',
              requestedBy: request.requestedBy,
              approvedBy: request.approvedBy,
              rejectedBy: request.rejectedBy,
              store: request.storeId,
              targetStore: request.targetStoreId,
              createdAt: request.createdAt,
              resolvedAt: request.approvedAt || request.rejectedAt || request.updatedAt,
              invoiceAmount: request.invoiceAmount,
              supplierName: request.supplierName || request.supplierId?.name || '',
              requests: [],
            };
          }
          accumulator[key].requests.push(request);
          return accumulator;
        }, {})
      ).sort((a, b) => new Date(b.resolvedAt || b.createdAt) - new Date(a.resolvedAt || a.createdAt)),
    [historyRequests]
  );

  useEffect(() => {
    setExpandedHistoryBatchKeys((previous) =>
      previous.filter((key) => groupedHistoryRequests.some((group) => group.key === key))
    );
  }, [groupedHistoryRequests]);

  const toggleHistoryBatch = (batchKey) => {
    setExpandedHistoryBatchKeys((previous) =>
      previous.includes(batchKey)
        ? previous.filter((key) => key !== batchKey)
        : [...previous, batchKey]
    );
  };

  const removeRequestItem = (indexToRemove) => {
    setRequestItems((previous) => previous.filter((_, index) => index !== indexToRemove));
  };

  const filteredProductsForItem = useMemo(() => {
    const query = String(currentItem.productQuery || '').trim().toLowerCase();
    if (!query) {
      return storeProducts;
    }

    return storeProducts.filter((product) => String(product.name || '').toLowerCase().includes(query));
  }, [storeProducts, currentItem.productQuery]);

  const addRequestItem = () => {
    if (!currentItem.productId || Number(currentItem.quantity) <= 0) {
      setMessage('Selecciona producto y cantidad válida antes de añadir');
      return;
    }

    setRequestItems((previous) => [
      ...previous,
      { productId: currentItem.productId, quantity: String(Number(currentItem.quantity)) },
    ]);

    setCurrentItem({ productId: '', quantity: '1', productQuery: '', showOptions: false });
    setMessage('');
  };

  const resetRequestForm = () => {
    setRequestItems([]);
    setCurrentItem({ productId: '', quantity: '1', productQuery: '', showOptions: false });
    setObservations('');
    setInvoiceAmount('');
    setSupplierId('');
    setShowNewSupplier(false);
    setNewSupplierName('');
    setTargetStoreId('');
    if (mode === 'transfer' && !isVendorTransfer) {
      setSourceStoreId('');
    }
  };

  const onCreateSupplierQuick = async () => {
    const name = String(newSupplierName || '').trim();
    if (!name) {
      setMessage('Escribe el nombre del proveedor.');
      return;
    }

    try {
      setCreatingSupplier(true);
      const response = await createInventorySupplier({ name });
      const created = response.data || null;
      if (!created?._id) {
        setMessage('No se pudo crear el proveedor.');
        return;
      }

      setSuppliers((previous) => {
        const exists = previous.some((item) => String(item._id) === String(created._id));
        if (exists) {
          return previous.map((item) => (
            String(item._id) === String(created._id)
              ? { ...item, name: created.name || item.name }
              : item
          ));
        }
        return [...previous, created].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'));
      });
      setSupplierId(String(created._id));
      setShowNewSupplier(false);
      setNewSupplierName('');
      setMessage(created.reused ? 'Proveedor ya existía; se seleccionó automáticamente.' : 'Proveedor creado y seleccionado.');
    } catch (error) {
      setMessage(error?.response?.data?.message || 'No se pudo crear el proveedor.');
    } finally {
      setCreatingSupplier(false);
    }
  };

  const submitRequest = async () => {
    if (submitting) {
      return;
    }

    if (requestItems.length === 0) {
      setMessage('Debe agregar productos en la tabla antes de solicitar ingresos.');
      return;
    }

    if (mode === 'transfer' && !sourceStoreId && !isVendorTransfer) {
      setMessage('Selecciona tienda origen');
      return;
    }

    if (mode !== 'transfer' && !currentStore?._id) {
      setMessage('No se encontró una tienda asignada para continuar.');
      return;
    }

    const normalizedItems = requestItems
      .map((item) => ({ productId: item.productId, quantity: Number(item.quantity) }))
      .filter((item) => item.productId);

    if (normalizedItems.length === 0) {
      setMessage('Debe agregar productos en la tabla antes de solicitar ingresos.');
      return;
    }

    if (normalizedItems.some((item) => item.quantity <= 0)) {
      setMessage('Verifica las cantidades de los productos agregados.');
      return;
    }

    if (mode === 'transfer' && !targetStoreId) {
      setMessage('Selecciona tienda destino');
      return;
    }

    const requestStoreId = mode === 'transfer'
      ? (isVendorTransfer ? currentStore?._id : sourceStoreId)
      : currentStore._id;

    if (!requestStoreId) {
      setMessage('No se encontró una tienda origen válida para el traslado.');
      return;
    }

    let normalizedInvoiceAmount = null;
    if (isIncomeMode && String(invoiceAmount || '').trim() !== '') {
      normalizedInvoiceAmount = Number(invoiceAmount);
      if (!Number.isFinite(normalizedInvoiceAmount) || normalizedInvoiceAmount < 0) {
        setMessage('El valor de la factura debe ser un número válido.');
        return;
      }
      if (normalizedInvoiceAmount > 0 && !supplierId) {
        setMessage('Selecciona o crea el proveedor de la factura.');
        return;
      }
    }

    const payload = {
      storeId: requestStoreId,
      targetStoreId: mode === 'transfer' ? targetStoreId : null,
      type: mode,
      items: normalizedItems,
      notes: observations,
      ...(isIncomeMode ? {
        invoiceAmount: normalizedInvoiceAmount,
        supplierId: supplierId || null,
      } : {}),
    };

    // Reset immediately after clicking submit so the vendor starts a fresh request.
    resetRequestForm();

    try {
      setSubmitting(true);
      await createInventoryRequest(payload);
      setSuccessModal({ open: true, fading: false });
      setMessage(
        isIncomeMode && normalizedInvoiceAmount > 0
          ? 'Solicitud enviada. La factura quedó registrada en Contabilidad (costo variable diario).'
          : 'Solicitud enviada. Debe ser autorizada por el administrador.'
      );
      // Refresh in background so UI loading state is tied only to submission.
      loadRequestsData().catch(() => {});
    } catch (error) {
      if (String(error?.code || '') === 'ECONNABORTED') {
        setMessage('La solicitud fue enviada pero la respuesta tardó demasiado. Actualiza la página para validar el estado.');
        return;
      }

      const backendMessage = error?.response?.data?.message || '';
      if (backendMessage === 'storeId, productId, type and quantity are required') {
        setMessage('El backend está desactualizado. Reinicia el servidor para habilitar solicitudes por tabla de productos.');
        return;
      }

      setMessage(backendMessage || 'No se pudo enviar la solicitud');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-grid single">
      <section className="panel">
        <h2>{(modeTitle[mode] || 'movimiento').toUpperCase()}</h2>

        <div className="card">
          <p>
            {mode === 'transfer' ? 'Tienda origen' : 'Tienda'}: <strong>{sourceStore?.name || 'Sin tienda seleccionada'}</strong>
          </p>
        </div>

        {mode === 'transfer' && !isVendorTransfer ? (
          <label>
            Tienda origen
            <select
              value={sourceStoreId}
              onChange={(event) => {
                setSourceStoreId(event.target.value);
                setRequestItems([]);
                setCurrentItem({ productId: '', quantity: '1', productQuery: '', showOptions: false });
                setMessage('');
              }}
            >
              <option value="">Selecciona origen</option>
              {stores.map((store) => (
                <option key={store._id} value={store._id}>
                  {store.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="card">
          <label>
            Producto
            <div className="product-picker">
              <input
                value={currentItem.productQuery}
                onFocus={() => setCurrentItem((previous) => ({ ...previous, showOptions: true }))}
                onClick={() => setCurrentItem((previous) => ({ ...previous, showOptions: true }))}
                onBlur={() => {
                  setTimeout(() => {
                    setCurrentItem((previous) => ({ ...previous, showOptions: false }));
                  }, 120);
                }}
                onChange={(event) =>
                  setCurrentItem((previous) => ({
                    ...previous,
                    productQuery: event.target.value,
                    productId: '',
                    showOptions: true,
                  }))
                }
                placeholder="Selecciona o escribe producto"
              />

              {currentItem.showOptions ? (
                <div className="product-picker-menu">
                  {filteredProductsForItem.map((product) => (
                    <button
                      className="product-picker-option"
                      key={product._id}
                      onMouseDown={() =>
                        setCurrentItem((previous) => ({
                          ...previous,
                          productId: product._id,
                          productQuery: product.name,
                          showOptions: false,
                        }))
                      }
                      type="button"
                    >
                      {product.name}
                    </button>
                  ))}
                  {filteredProductsForItem.length === 0 ? (
                    <p className="product-picker-empty">Sin resultados</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </label>

          <label>
            Cantidad
            <input
              value={currentItem.quantity}
              onChange={(event) => setCurrentItem((previous) => ({ ...previous, quantity: event.target.value }))}
              type="number"
              min="1"
            />
          </label>
        </div>

        <button className="btn" type="button" onClick={addRequestItem}>
          Agregar producto
        </button>

        {mode === 'transfer' ? (
          <label>
            Tienda destino
            <select value={targetStoreId} onChange={(event) => setTargetStoreId(event.target.value)}>
              <option value="">Selecciona destino</option>
              {targetStores.map((store) => (
                <option key={store._id} value={store._id}>
                  {store.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {isIncomeMode ? (
          <div className="card inventory-invoice-card">
            <h4>Factura del proveedor</h4>
            <p className="inventory-invoice-hint">
              Si el ingreso llega con factura, registra el valor y el proveedor. El monto se carga automáticamente en Contabilidad como costo variable del día.
            </p>
            <label>
              Valor de la factura
              <input
                type="number"
                min="0"
                step="100"
                placeholder="Ej: 250000"
                value={invoiceAmount}
                onChange={(event) => setInvoiceAmount(event.target.value)}
              />
            </label>
            <label>
              Proveedor
              <select
                value={supplierId}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === '__new__') {
                    setShowNewSupplier(true);
                    setSupplierId('');
                    return;
                  }
                  setShowNewSupplier(false);
                  setSupplierId(value);
                }}
              >
                <option value="">Selecciona proveedor</option>
                {suppliers.map((supplier) => (
                  <option key={supplier._id} value={supplier._id}>
                    {supplier.name}
                  </option>
                ))}
                <option value="__new__">+ Crear proveedor nuevo</option>
              </select>
            </label>
            {showNewSupplier ? (
              <div className="inventory-new-supplier">
                <label>
                  Nombre del proveedor
                  <input
                    placeholder="Ej: Distribuidora La 30"
                    value={newSupplierName}
                    onChange={(event) => setNewSupplierName(event.target.value)}
                  />
                </label>
                <div className="row gap">
                  <button className="btn btn-primary" type="button" onClick={onCreateSupplierQuick} disabled={creatingSupplier}>
                    {creatingSupplier ? 'Creando...' : 'Crear y seleccionar'}
                  </button>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => {
                      setShowNewSupplier(false);
                      setNewSupplierName('');
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="card">
          <h4>Productos agregados</h4>
          <label>
            Observaciones
            <textarea
              value={observations}
              onChange={(event) => setObservations(event.target.value)}
              rows={3}
              placeholder="Observaciones generales para este grupo de productos"
            />
          </label>

          {requestItems.length > 0 ? (
            <table className="simple-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Stock actual</th>
                  <th>Cantidad</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {requestItems.map((item, index) => {
                  const product = storeProducts.find((candidate) => String(candidate._id) === String(item.productId));
                  const productName = product?.name || item.productId;
                  return (
                    <tr key={`${item.productId}-${index}`}>
                      <td>{productName}</td>
                      <td>{product?.stock ?? 'N/A'}</td>
                      <td>{item.quantity}</td>
                      <td>
                        <button className="btn" type="button" onClick={() => removeRequestItem(index)}>
                          Quitar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p>No has agregado productos aún.</p>
          )}
        </div>

        <button className="btn btn-primary" type="button" onClick={submitRequest} disabled={submitting}>
          {submitting
            ? 'Enviando...'
            : mode === 'in'
              ? 'Solicitar ingresos'
              : mode === 'transfer'
                ? 'Solicitar traslados'
                : `Enviar ${modeTitle[mode] || 'solicitud'}`}
        </button>

        <section className="panel soft">
          <h3>Solicitudes pendientes</h3>
          <button className="btn" type="button" onClick={loadRequestsData}>
            Actualizar
          </button>

          {groupedPendingRequests.length === 0 ? <p>No hay solicitudes pendientes.</p> : null}

          {groupedPendingRequests.map((group) => (
            <div className="card" key={group.key}>
              <p>
                Tienda: {group.store?.name || 'N/A'}
                {group.targetStore?.name ? ` -> ${group.targetStore.name}` : ''}
              </p>
              <p>Solicitado por: {group.requestedBy?.name || 'N/A'}</p>
              {Number(group.invoiceAmount) > 0 ? (
                <p>
                  Factura: {formatCurrency(group.invoiceAmount)}
                  {group.supplierName ? ` · Proveedor: ${group.supplierName}` : ''}
                </p>
              ) : null}
              {group.notes ? <p>Observaciones: {group.notes}</p> : null}
              <table className="simple-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {group.requests.map((request) => (
                    <tr key={request._id}>
                      <td>{request.productId?.name || 'Producto'}</td>
                      <td>{request.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>

        <section className="panel soft">
          <h3>Historial</h3>
          {groupedHistoryRequests.length === 0 ? <p>No hay solicitudes aprobadas o rechazadas.</p> : null}

          {groupedHistoryRequests.length > 0 ? (
            <div className="approval-history-scroll">
              {groupedHistoryRequests.map((group) => (
                <div className="card" key={group.key}>
                  <p>Lote: {String(group.key || '').slice(0, 8) || 'N/A'}</p>
                  <p>
                    Estado: {group.status === 'approved' ? 'Aprobada' : 'Rechazada'}
                    {' | '}
                    Fecha: {formatDateTime(group.resolvedAt)}
                  </p>
                  <p>
                    Tienda: {group.store?.name || 'N/A'}
                    {group.targetStore?.name ? ` -> ${group.targetStore.name}` : ''}
                  </p>
                  <p>Solicitado por: {group.requestedBy?.name || 'N/A'}</p>
                  <p>
                    {group.status === 'approved' ? 'Aprobado por' : 'Rechazado por'}:{' '}
                    {group.status === 'approved'
                      ? group.approvedBy?.name || group.approvedBy?.username || 'N/A'
                      : group.rejectedBy?.name || group.rejectedBy?.username || 'N/A'}
                  </p>
                  {Number(group.invoiceAmount) > 0 ? (
                    <p>
                      Factura: {formatCurrency(group.invoiceAmount)}
                      {group.supplierName ? ` · Proveedor: ${group.supplierName}` : ''}
                    </p>
                  ) : null}
                  {group.notes ? <p>Observaciones: {group.notes}</p> : null}
                  <button className="btn" type="button" onClick={() => toggleHistoryBatch(group.key)}>
                    {expandedHistoryBatchKeys.includes(group.key)
                      ? 'Ocultar productos del lote'
                      : `Ver productos del lote (${group.requests.length})`}
                  </button>
                  {expandedHistoryBatchKeys.includes(group.key) ? (
                    <table className="simple-table">
                      <thead>
                        <tr>
                          <th>Producto</th>
                          <th>Cantidad</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.requests.map((request) => (
                          <tr key={request._id}>
                            <td>{request.productId?.name || 'Producto'}</td>
                            <td>{request.quantity}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <DismissibleNotice text={message} type="info" onClose={() => setMessage('')} />
      </section>

      {successModal.open ? (
        <div className={`brand-popup-overlay ${successModal.fading ? 'inventory-apply-overlay-fading' : ''}`} role="status" aria-live="polite">
          <div className={`brand-popup brand-popup-success ${successModal.fading ? 'inventory-apply-popup-fading' : ''}`}>
            <h3>Solicitud enviada</h3>
            <p>La solicitud fue registrada con éxito y quedó pendiente de aprobación del administrador.</p>
          </div>
        </div>
      ) : null}

      {submitting ? (
        <div className="brand-popup-overlay" role="status" aria-live="polite" aria-busy="true">
          <div className="brand-popup">
            <div className="legacy-migration-spinner" aria-hidden="true" />
            <h3>Cargando...</h3>
            <p>Estamos procesando tu solicitud. Por favor espera.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default InventoryRequestPage;
