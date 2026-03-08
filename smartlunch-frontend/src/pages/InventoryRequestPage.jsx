import { useEffect, useMemo, useState } from 'react';
import { createInventoryRequest, getInventoryRequests } from '../services/inventory.service';
import { getProducts } from '../services/products.service';
import { getStores } from '../services/stores.service';
import useAuthStore from '../store/auth.store';
import DismissibleNotice from '../components/DismissibleNotice';

const modeTitle = {
  in: 'ingresos',
  out: 'egresos',
  transfer: 'traslados',
};

function InventoryRequestPage({ mode }) {
  const { currentStore, setCurrentStore } = useAuthStore();
  const [products, setProducts] = useState([]);
  const [stores, setStores] = useState([]);
  const [requestItems, setRequestItems] = useState([]);
  const [currentItem, setCurrentItem] = useState({ productId: '', quantity: '1', productQuery: '', showOptions: false });
  const [targetStoreId, setTargetStoreId] = useState('');
  const [observations, setObservations] = useState('');
  const [pendingRequests, setPendingRequests] = useState([]);
  const [message, setMessage] = useState('');
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [storesRes, productsRes] = await Promise.all([getStores(), getProducts()]);
        const storesData = storesRes.data || [];
        const productsData = productsRes.data || [];

        setStores(storesData);
        setProducts(productsData);

        if (!currentStore && storesData[0]) {
          setCurrentStore(storesData[0]);
        }
      } catch (error) {
        setMessage(error?.response?.data?.message || 'No se pudo cargar inventario');
      }
    };

    load();
  }, [currentStore, setCurrentStore]);

  const loadPendingRequests = async () => {
    try {
      const response = await getInventoryRequests({ status: 'pending', type: mode });
      setPendingRequests(response.data || []);
    } catch (error) {
      setPendingRequests([]);
    }
  };

  useEffect(() => {
    loadPendingRequests();
    const intervalId = setInterval(loadPendingRequests, 12000);
    return () => clearInterval(intervalId);
  }, [mode]);

  const storeProducts = useMemo(() => {
    if (!currentStore?._id) {
      return products;
    }

    return products.filter((product) => String(product.storeId) === String(currentStore._id));
  }, [products, currentStore?._id]);

  const targetStores = useMemo(() => {
    if (!currentStore?._id) {
      return stores;
    }
    return stores.filter((store) => String(store._id) !== String(currentStore._id));
  }, [stores, currentStore?._id]);

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
              requests: [],
            };
          }
          accumulator[key].requests.push(request);
          return accumulator;
        }, {})
      ),
    [pendingRequests]
  );

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

  const submitRequest = async () => {
    if (requestItems.length === 0) {
      setMessage('Debe agregar productos en la tabla antes de solicitar ingresos.');
      return;
    }

    if (!currentStore?._id) {
      setMessage('Selecciona la tienda para continuar.');
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

    try {
      await createInventoryRequest({
        storeId: currentStore._id,
        targetStoreId: mode === 'transfer' ? targetStoreId : null,
        type: mode,
        items: normalizedItems,
        notes: observations,
      });
      setShowSuccessPopup(true);
      setMessage('Solicitud enviada. Debe ser autorizada por el administrador.');
      setRequestItems([]);
      setCurrentItem({ productId: '', quantity: '1', productQuery: '', showOptions: false });
      setObservations('');
      await loadPendingRequests();
    } catch (error) {
      const backendMessage = error?.response?.data?.message || '';
      if (backendMessage === 'storeId, productId, type and quantity are required') {
        setMessage('El backend está desactualizado. Reinicia el servidor para habilitar solicitudes por tabla de productos.');
        return;
      }

      setMessage(backendMessage || 'No se pudo enviar la solicitud');
    }
  };

  return (
    <div className="page-grid single">
      <section className="panel">
        <h2>{(modeTitle[mode] || 'movimiento').toUpperCase()}</h2>

        <label>
          {mode === 'transfer' ? 'Tienda origen' : 'Tienda'}
          <select
            value={currentStore?._id || ''}
            onChange={(event) => {
              const selected = stores.find((store) => String(store._id) === event.target.value) || null;
              setCurrentStore(selected);
              setRequestItems([]);
              setCurrentItem({ productId: '', quantity: '1', productQuery: '', showOptions: false });
            }}
          >
            <option value="">Selecciona tienda</option>
            {stores.map((store) => (
              <option key={store._id} value={store._id}>
                {store.name}
              </option>
            ))}
          </select>
        </label>

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
                      {currentStore?._id ? '' : ` (${product.storeName || 'Tienda'})`}
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

        <button className="btn btn-primary" type="button" onClick={submitRequest}>
          {mode === 'in' ? 'Solicitar ingresos' : mode === 'transfer' ? 'Solicitar traslados' : `Enviar ${modeTitle[mode] || 'solicitud'}`}
        </button>

        <section className="panel soft">
          <h3>Solicitudes pendientes</h3>
          <button className="btn" type="button" onClick={loadPendingRequests}>
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

        <DismissibleNotice text={message} type="info" onClose={() => setMessage('')} />
      </section>

      {showSuccessPopup ? (
        <div className="brand-popup-overlay" role="dialog" aria-modal="true" aria-label="Solicitud enviada">
          <div className="brand-popup brand-popup-success">
            <h3>Solicitud enviada</h3>
            <p>La solicitud fue registrada con éxito y quedó pendiente de aprobación del administrador.</p>
            <div className="brand-popup-actions">
              <button className="btn btn-primary" type="button" onClick={() => setShowSuccessPopup(false)}>
                Entendido
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default InventoryRequestPage;
