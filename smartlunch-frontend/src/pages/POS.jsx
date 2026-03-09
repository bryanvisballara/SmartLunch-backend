import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import ProductCard from '../components/ProductCard';
import OrderSummary from '../components/OrderSummary';
import DismissibleNotice from '../components/DismissibleNotice';
import { getStudentById, getStudents } from '../services/students.service';
import { getBalance } from '../services/wallet.service';
import { createOrder, getOrders } from '../services/orders.service';
import { getProducts } from '../services/products.service';
import { getStores } from '../services/stores.service';
import useAuthStore from '../store/auth.store';

const OFFLINE_POS_ORDERS_KEY = 'smartlunch_pos_offline_orders_v1';

const getOfflinePosOrders = () => {
  try {
    const raw = localStorage.getItem(OFFLINE_POS_ORDERS_KEY);
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const setOfflinePosOrders = (orders) => {
  localStorage.setItem(OFFLINE_POS_ORDERS_KEY, JSON.stringify(Array.isArray(orders) ? orders : []));
};

const isNetworkError = (error) => {
  if (!error) {
    return false;
  }

  if (!error.response) {
    return true;
  }

  return ['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT'].includes(String(error.code || ''));
};

function POS() {
  const { currentStore, setCurrentStore } = useAuthStore();
  const [query, setQuery] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [allStudents, setAllStudents] = useState([]);
  const [students, setStudents] = useState([]);
  const [student, setStudent] = useState(null);
  const [sellToGuest, setSellToGuest] = useState(false);
  const [studentDetails, setStudentDetails] = useState(null);
  const [balance, setBalance] = useState(null);
  const [spentToday, setSpentToday] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('system');
  const [cashTendered, setCashTendered] = useState('');
  const [schoolBillingFor, setSchoolBillingFor] = useState('');
  const [schoolBillingResponsible, setSchoolBillingResponsible] = useState('');
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [showValidationPopup, setShowValidationPopup] = useState(false);
  const [validationMessage, setValidationMessage] = useState('');
  const [lastOrderSummary, setLastOrderSummary] = useState(null);
  const [message, setMessage] = useState('');
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [queueSyncing, setQueueSyncing] = useState(false);
  const [queuedOrdersCount, setQueuedOrdersCount] = useState(0);

  const openValidationPopup = (text) => {
    setValidationMessage(text);
    setShowValidationPopup(true);
  };

  const paymentLabelMap = {
    system: 'Sistema',
    cash: 'Efectivo',
    qr: 'QR',
    dataphone: 'Datáfono',
    transfer: 'Transferencia',
    school_billing: 'Cuenta de cobro colegio',
  };

  const loadProducts = async () => {
    try {
      setProductsLoading(true);
      let activeStoreId = currentStore?._id || null;

      if (!activeStoreId) {
        const storesResponse = await getStores();
        const firstStore = storesResponse.data?.[0] || null;
        if (firstStore?._id) {
          setCurrentStore(firstStore);
          activeStoreId = firstStore._id;
        }
      }

      if (!activeStoreId) {
        setProducts([]);
        setMessage('No hay una tienda activa para esta sesión');
        return;
      }

      const response = await getProducts({ storeId: activeStoreId });
      const loadedProducts = response.data || [];
      setProducts(loadedProducts);
      setMessage('');
    } catch (error) {
      setMessage(error?.response?.data?.message || 'No se pudieron cargar productos');
    } finally {
      setProductsLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, [currentStore?._id]);

  useEffect(() => {
    let isMounted = true;

    getStudents()
      .then((response) => {
        if (!isMounted) {
          return;
        }
        setAllStudents(response.data || []);
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }
        setAllStudents([]);
        setMessage(error?.response?.data?.message || 'No se pudo cargar la lista de alumnos');
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const categories = useMemo(() => {
    const map = new Map();
    for (const product of products) {
      if (!product.categoryId) {
        continue;
      }
      if (!map.has(product.categoryId)) {
        map.set(product.categoryId, product.categoryName || 'Sin categoría');
      }
    }

    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [products]);

  useEffect(() => {
    if (categories.length === 0) {
      setSelectedCategory('');
      return;
    }

    if (!selectedCategory || !categories.some((category) => category.id === selectedCategory)) {
      setSelectedCategory(categories[0].id);
    }
  }, [categories, selectedCategory]);

  useEffect(() => {
    if (student || sellToGuest) {
      setStudents([]);
      return;
    }

    const queryText = String(query || '').trim().toLowerCase();
    if (!queryText) {
      setStudents(allStudents);
      return;
    }

    const filteredStudents = allStudents.filter((studentItem) => {
      const name = String(studentItem?.name || '').toLowerCase();
      const schoolCode = String(studentItem?.schoolCode || '').toLowerCase();
      return name.includes(queryText) || schoolCode.includes(queryText);
    });

    setStudents(filteredStudents);
  }, [query, student, sellToGuest, allStudents]);

  const balanceMutation = useMutation({
    mutationFn: getBalance,
    onSuccess: (response) => {
      setBalance(response.data.balance);
    },
    onError: (error) => {
      setMessage(error?.response?.data?.message || 'No se pudo cargar saldo');
    },
  });

  const studentDetailsMutation = useMutation({
    mutationFn: getStudentById,
    onSuccess: (response) => {
      setStudentDetails(response.data || null);
    },
    onError: () => {
      setStudentDetails(null);
    },
  });

  const refreshQueuedOrdersCount = () => {
    setQueuedOrdersCount(getOfflinePosOrders().length);
  };

  const buildOrderSummaryFromCart = (cartItems, method) => {
    const normalizedItems = (cartItems || []).map((item) => ({
      name: item.name || item.nameSnapshot || 'Producto',
      quantity: Number(item.quantity || 0),
      subtotal: Number(item.price || item.unitPriceSnapshot || 0) * Number(item.quantity || 0),
    }));

    return {
      paymentMethod: paymentLabelMap[method] || method,
      total: normalizedItems.reduce((sum, item) => sum + Number(item.subtotal || 0), 0),
      items: normalizedItems,
    };
  };

  const syncOfflineOrders = async () => {
    if (queueSyncing || !navigator.onLine) {
      return;
    }

    const pendingOrders = getOfflinePosOrders();
    if (!pendingOrders.length) {
      refreshQueuedOrdersCount();
      return;
    }

    setQueueSyncing(true);
    let sentCount = 0;

    try {
      let queue = [...pendingOrders];

      while (queue.length > 0) {
        const nextOrder = queue[0];
        try {
          await createOrder(nextOrder.payload);
          queue.shift();
          setOfflinePosOrders(queue);
          sentCount += 1;
        } catch (error) {
          if (isNetworkError(error)) {
            break;
          }

          // Keep item in queue for manual review; stop processing to avoid silent data loss.
          setMessage(
            error?.response?.data?.message ||
              'Una orden en caché no se pudo sincronizar. Revisa los datos y vuelve a intentar.'
          );
          break;
        }
      }

      refreshQueuedOrdersCount();

      if (sentCount > 0) {
        setMessage(`${sentCount} orden(es) se sincronizaron automaticamente.`);
        loadProducts();
      }
    } finally {
      setQueueSyncing(false);
    }
  };

  const enqueueOfflineOrder = (payload, summary) => {
    const queuedOrder = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      createdAt: new Date().toISOString(),
      payload,
      summary,
    };

    const currentQueue = getOfflinePosOrders();
    currentQueue.push(queuedOrder);
    setOfflinePosOrders(currentQueue);
    refreshQueuedOrdersCount();
  };

  const submitOrder = async (payload, cartSnapshot) => {
    const orderSummary = buildOrderSummaryFromCart(cartSnapshot, payload.paymentMethod);

    if (!navigator.onLine) {
      enqueueOfflineOrder(payload, orderSummary);
      setItems([]);
      setCashTendered('');
      setSchoolBillingFor('');
      setSchoolBillingResponsible('');
      setMessage('Sin internet: la orden quedo guardada en caché y se enviará automáticamente al volver la conexión.');
      return;
    }

    setOrderSubmitting(true);

    try {
      const response = await createOrder(payload);
      const order = response?.data;
      if (order) {
        setLastOrderSummary({
          paymentMethod: paymentLabelMap[order.paymentMethod] || order.paymentMethod,
          total: Number(order.total || 0),
          items: (order.items || []).map((item) => ({
            name: item.nameSnapshot || 'Producto',
            quantity: Number(item.quantity || 0),
            subtotal: Number(item.subtotal || 0),
          })),
        });
      } else {
        setLastOrderSummary(orderSummary);
      }

      setItems([]);
      setCashTendered('');
      setSchoolBillingFor('');
      setSchoolBillingResponsible('');
      setMessage('');
      setShowSuccessPopup(true);
      if (student?._id) {
        balanceMutation.mutate(student._id);
      }
      loadProducts();
    } catch (error) {
      if (isNetworkError(error)) {
        enqueueOfflineOrder(payload, orderSummary);
        setItems([]);
        setCashTendered('');
        setSchoolBillingFor('');
        setSchoolBillingResponsible('');
        setMessage('Internet inestable: la orden quedó en caché y se sincronizará automáticamente.');
      } else {
        setMessage(error?.response?.data?.message || 'No se pudo crear la orden');
      }
    } finally {
      setOrderSubmitting(false);
    }
  };

  useEffect(() => {
    refreshQueuedOrdersCount();
    syncOfflineOrders();

    const onOnline = () => {
      syncOfflineOrders();
    };

    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('online', onOnline);
    };
  }, []);

  const selectedStoreId = useMemo(() => {
    return items[0]?.storeId || null;
  }, [items]);

  const cartTotal = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0),
    [items]
  );

  const cashTenderedValue = Number(cashTendered || 0);

  useEffect(() => {
    if (paymentMethod !== 'cash' && cashTendered !== '') {
      setCashTendered('');
    }
  }, [paymentMethod, cashTendered]);

  useEffect(() => {
    if (paymentMethod !== 'school_billing') {
      if (schoolBillingFor !== '') {
        setSchoolBillingFor('');
      }
      if (schoolBillingResponsible !== '') {
        setSchoolBillingResponsible('');
      }
    }
  }, [paymentMethod, schoolBillingFor, schoolBillingResponsible]);

  const blockedProductIds = useMemo(
    () => new Set((studentDetails?.blockedProducts || []).map((item) => String(item._id || item))),
    [studentDetails]
  );

  const blockedCategoryIds = useMemo(
    () => new Set((studentDetails?.blockedCategories || []).map((item) => String(item._id || item))),
    [studentDetails]
  );

  const dailyLimit = Number(studentDetails?.dailyLimit || 0);

  const remainingLimit = useMemo(() => {
    if (dailyLimit <= 0) {
      return null;
    }

    return dailyLimit - Number(spentToday || 0) - Number(cartTotal || 0);
  }, [dailyLimit, spentToday, cartTotal]);

  const productBlockReason = (product) => {
    if (!studentDetails) {
      return null;
    }

    if (blockedProductIds.has(String(product._id))) {
      return 'Producto bloqueado';
    }

    if (blockedCategoryIds.has(String(product.categoryId))) {
      return 'Categoría bloqueada';
    }

    if (dailyLimit > 0 && Number(spentToday) + Number(cartTotal) + Number(product.price) > dailyLimit) {
      return 'Tope excedido';
    }

    return null;
  };

  const getCartQuantity = (productId) => {
    const found = items.find((item) => item._id === productId);
    return found ? found.quantity : 0;
  };

  const selectStudent = (studentItem) => {
    setStudent(studentItem);
    setQuery(studentItem.name);
    setStudents([]);
    setStudentDetails(null);
    setBalance(null);
    setSpentToday(0);
    setMessage('');
    studentDetailsMutation.mutate(studentItem._id);
    balanceMutation.mutate(studentItem._id);

    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

    getOrders({ studentId: studentItem._id, from, to })
      .then((response) => {
        const total = (response.data || [])
          .filter((order) => order.status === 'completed')
          .reduce((sum, order) => sum + Number(order.total || 0), 0);
        setSpentToday(total);
      })
      .catch(() => {
        setSpentToday(0);
      });
  };

  const clearStudentSelection = () => {
    setStudent(null);
    setStudentDetails(null);
    setBalance(null);
    setSpentToday(0);
    setSellToGuest(false);
    setQuery('');
    setStudents([]);
    setMessage('');
  };

  const addItem = (product) => {
    const blockedReason = productBlockReason(product);
    if (blockedReason) {
      setMessage(blockedReason);
      return;
    }

    if (product.status !== 'active') {
      setMessage('Producto inactivo');
      return;
    }

    if (selectedStoreId && String(selectedStoreId) !== String(product.storeId)) {
      setMessage('Solo puedes cobrar productos de una tienda por orden');
      return;
    }

    setItems((previous) => {
      const found = previous.find((item) => item._id === product._id);
      if (found) {
        return previous.map((item) =>
          item._id === product._id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }

      setMessage('');

      return [...previous, { ...product, quantity: 1 }];
    });
  };

  const removeItem = (productId) => {
    setItems((previous) => previous.filter((item) => item._id !== productId));
  };

  const changeItemQuantity = (productId, delta) => {
    setItems((previous) => {
      const found = previous.find((item) => item._id === productId);
      if (!found) {
        return previous;
      }

      const nextQuantity = found.quantity + delta;

      if (nextQuantity <= 0) {
        return previous.filter((item) => item._id !== productId);
      }

      if (delta > 0 && dailyLimit > 0) {
        const currentTotal = previous.reduce(
          (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
          0
        );
        const nextTotal = currentTotal + Number(found.price || 0);
        if (Number(spentToday) + nextTotal > dailyLimit) {
          setMessage('El alumno supera el tope diario configurado');
          return previous;
        }
      }

      setMessage('');

      return previous.map((item) =>
        item._id === productId ? { ...item, quantity: nextQuantity } : item
      );
    });
  };

  const orderPayload = useMemo(() => {
    if (!sellToGuest && !student?._id) {
      return null;
    }

    return {
      ...(sellToGuest ? {} : { studentId: student._id }),
      guestSale: sellToGuest,
      storeId: selectedStoreId,
      paymentMethod,
      schoolBillingFor: paymentMethod === 'school_billing' ? String(schoolBillingFor || '').trim() : '',
      schoolBillingResponsible: paymentMethod === 'school_billing' ? String(schoolBillingResponsible || '').trim() : '',
      items: items.map((item) => ({ productId: item._id, quantity: item.quantity })),
    };
  }, [student, sellToGuest, items, selectedStoreId, paymentMethod, schoolBillingFor, schoolBillingResponsible]);

  const canCheckout = items.length > 0;

  const filteredProducts = useMemo(() => {
    const queryText = productQuery.trim().toLowerCase();

    return products.filter((product) => {
      const matchesCategory = selectedCategory ? product.categoryId === selectedCategory : false;
      if (!matchesCategory) {
        return false;
      }

      if (!queryText) {
        return true;
      }

      return product.name.toLowerCase().includes(queryText);
    });
  }, [products, productQuery, selectedCategory]);

  return (
    <div className="page-grid pos-layout">
      <section className="panel">
        <h2>Selecciona el alumno</h2>
        <div className="row gap student-search-row">
          <input
            placeholder="Escribe el nombre del estudiante"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={Boolean(student) || sellToGuest}
          />
        </div>

        <label className="payment-option pos-external-sale-option">
          <input
            type="checkbox"
            checked={sellToGuest}
            onChange={(event) => {
              const checked = event.target.checked;
              setSellToGuest(checked);
              if (checked) {
                setStudent(null);
                setStudents([]);
                setStudentDetails(null);
                setBalance(null);
                setSpentToday(0);
                setQuery('');
                if (paymentMethod === 'system') {
                  setPaymentMethod('cash');
                }
              }
            }}
          />
          <span>Venta externa</span>
        </label>

        {!student && students.length > 0 ? (
          <div className="panel soft pos-scroll-area student-list-panel">
            {students.map((studentItem) => (
              <button
                className="btn"
                key={studentItem._id}
                onClick={() => selectStudent(studentItem)}
                type="button"
              >
                {studentItem.name} {studentItem.schoolCode ? `(${studentItem.schoolCode})` : ''}
              </button>
            ))}
          </div>
        ) : null}

        {student && !sellToGuest ? (
          <div className="panel soft">
            <p>
              Estudiante: <strong>{student.name}</strong>
            </p>
            <button className="btn" onClick={clearStudentSelection} type="button">
              Borrar selección
            </button>
            {balance !== null ? <p>Saldo: ${Number(balance).toLocaleString('es-CO')}</p> : null}
            {studentDetails ? (
              <div className="student-rules">
                <p>
                  Tope diario: {
                    Number(studentDetails.dailyLimit || 0) > 0
                      ? `$${Number(studentDetails.dailyLimit).toLocaleString('es-CO')}`
                      : 'Sin tope configurado'
                  }
                </p>
                <p>Consumido hoy: ${Number(spentToday || 0).toLocaleString('es-CO')}</p>
                {remainingLimit !== null ? (
                  <p>Disponible hoy: ${Math.max(0, Number(remainingLimit || 0)).toLocaleString('es-CO')}</p>
                ) : null}
                <p>
                  Restricciones:
                  {studentDetails.blockedCategories?.length || studentDetails.blockedProducts?.length
                    ? ''
                    : ' Sin restricciones configuradas'}
                </p>
                {studentDetails.blockedCategories?.length ? (
                  <p>
                    Categorías bloqueadas: {studentDetails.blockedCategories.map((c) => c.name).join(', ')}
                  </p>
                ) : null}
                {studentDetails.blockedProducts?.length ? (
                  <p>
                    Productos bloqueados: {studentDetails.blockedProducts.map((p) => p.name).join(', ')}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {sellToGuest ? (
          <div className="panel soft">
            <p>Venta a cliente no registrado.</p>
          </div>
        ) : null}

        {queuedOrdersCount > 0 ? (
          <div className="panel soft">
            <p>
              Ordenes pendientes por sincronizar: <strong>{queuedOrdersCount}</strong>
            </p>
            <button className="btn" type="button" onClick={syncOfflineOrders} disabled={queueSyncing || !navigator.onLine}>
              {queueSyncing ? 'Sincronizando...' : 'Sincronizar ahora'}
            </button>
          </div>
        ) : null}

        <DismissibleNotice text={message} type="info" onClose={() => setMessage('')} />
      </section>

      <section className="panel product-panel">
        <h3>Elige el producto a vender</h3>
        <div className="category-list">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              className={`btn btn-chip ${selectedCategory === category.id ? 'is-active' : ''}`}
              onClick={() => setSelectedCategory(category.id)}
            >
              {category.name}
            </button>
          ))}
        </div>

        <label className="search-wrap" htmlFor="product-search">
          <svg aria-hidden="true" className="search-icon" viewBox="0 0 24 24">
            <path
              d="M11 4a7 7 0 1 0 4.4 12.4l3.1 3.1a1 1 0 0 0 1.4-1.4l-3.1-3.1A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10a5 5 0 0 1 0-10Z"
              fill="currentColor"
            />
          </svg>
          <input
            id="product-search"
            placeholder="Buscar producto"
            value={productQuery}
            onChange={(e) => setProductQuery(e.target.value)}
          />
        </label>

        {productsLoading ? <p>Cargando productos...</p> : null}
        {!productsLoading && categories.length === 0 ? <p>No hay categorías disponibles</p> : null}
        {!productsLoading && selectedCategory && filteredProducts.length === 0 ? (
          <p>No hay productos para esta categoría.</p>
        ) : null}
        {!productsLoading ? (
          <div className="cards cards-compact pos-scroll-area">
            {filteredProducts.map((product) => {
              const reason = productBlockReason(product);
              const quantityInCart = getCartQuantity(product._id);
              const disabledLabel = reason || (product.status !== 'active' ? 'No disponible' : 'Agregar');

              return (
                <ProductCard
                  key={product._id}
                  onAdd={addItem}
                  product={product}
                  quantityInCart={quantityInCart}
                  forceDisabled={Boolean(reason)}
                  disabledLabel={disabledLabel}
                  disabledReason={reason || ''}
                />
              );
            })}
          </div>
        ) : null}
      </section>

      <OrderSummary
        items={items}
        onRemoveItem={removeItem}
        onChangeQuantity={changeItemQuantity}
        paymentMethod={paymentMethod}
        onPaymentMethodChange={setPaymentMethod}
        disabledPaymentMethods={sellToGuest ? ['system'] : []}
        loading={orderSubmitting || queueSyncing || balanceMutation.isPending}
        onSubmit={() => {
          if (!orderPayload) {
            openValidationPopup('Debes seleccionar un alumno o activar Venta externa para continuar.');
            return;
          }

          if (sellToGuest && paymentMethod === 'system') {
            setMessage('Venta a cliente no registrado no permite pago por sistema');
            return;
          }

          if (dailyLimit > 0 && Number(spentToday) + Number(cartTotal) > dailyLimit) {
            setMessage('No se puede cobrar: el alumno supera el tope diario');
            return;
          }

          if (paymentMethod === 'school_billing') {
            if (!String(schoolBillingFor || '').trim() || !String(schoolBillingResponsible || '').trim()) {
              setMessage('Para cuenta de cobro colegio debes indicar dirigido a y responsable.');
              return;
            }
          }

          submitOrder(orderPayload, items);
        }}
        disabled={!canCheckout}
        cashTendered={cashTendered}
        onCashTenderedChange={setCashTendered}
        schoolBillingFor={schoolBillingFor}
        onSchoolBillingForChange={setSchoolBillingFor}
        schoolBillingResponsible={schoolBillingResponsible}
        onSchoolBillingResponsibleChange={setSchoolBillingResponsible}
      />

      {showSuccessPopup ? (
        <div className="success-overlay" role="dialog" aria-modal="true" aria-label="Venta registrada">
          <div className="success-modal">
            <div className="success-icon" aria-hidden="true">OK</div>
            <h3>Venta registrada con éxito</h3>
            <p>La venta fue guardada correctamente.</p>
            {lastOrderSummary ? (
              <div className="success-order-summary">
                <p>Método de pago: {lastOrderSummary.paymentMethod}</p>
                {lastOrderSummary.items.map((item, index) => (
                  <p key={`${item.name}-${index}`}>
                    {item.quantity} x {item.name} - ${item.subtotal.toLocaleString('es-CO')}
                  </p>
                ))}
                <p className="success-order-total">
                  Total: ${lastOrderSummary.total.toLocaleString('es-CO')}
                </p>
              </div>
            ) : null}
            <button className="btn btn-primary" type="button" onClick={() => setShowSuccessPopup(false)}>
              Cerrar
            </button>
          </div>
        </div>
      ) : null}

      {showValidationPopup ? (
        <div className="success-overlay" role="dialog" aria-modal="true" aria-label="Validación de venta">
          <div className="success-modal validation-modal">
            <div className="success-icon validation-icon" aria-hidden="true">!</div>
            <h3>Falta información para cobrar</h3>
            <p>{validationMessage}</p>
            <button className="btn btn-primary" type="button" onClick={() => setShowValidationPopup(false)}>
              Entendido
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default POS;
