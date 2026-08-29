import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  createParentPreorder,
  deleteParentPreorder,
  getParentPreorderCatalog,
  updateParentPortalStudentCafeteriaLevel,
  updateParentPreorder,
} from '../services/parent.service';

function formatCurrency(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function cartTotal(cart) {
  return Object.values(cart).reduce((sum, item) => (
    sum + Number(item.price || 0) * Number(item.quantity || 0)
  ), 0);
}

function cartItems(cart) {
  return Object.values(cart).filter((item) => Number(item.quantity || 0) > 0);
}

export default function ParentPreordersPanel({
  studentId,
  student,
  categoryId = '',
  categoriesPath,
  onStudentUpdated,
}) {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cart, setCart] = useState({});
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetOffset, setSheetOffset] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [gradeDraft, setGradeDraft] = useState('');
  const [savingLevel, setSavingLevel] = useState(false);
  const [editingGrade, setEditingGrade] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState('');
  const dragStartYRef = useRef(0);
  const draggingRef = useRef(false);
  const sheetRef = useRef(null);

  const isProductsPage = Boolean(categoryId);
  const editingOrder = (catalog?.pendingPreorders || []).find((order) => String(order._id) === String(editingOrderId));
  const remainingToday = catalog?.remainingToday == null
    ? null
    : Number(catalog.remainingToday) + Number(editingOrder?.total || 0);
  const catalogBlockedByLimit = remainingToday != null && remainingToday <= 0 && !editingOrderId;
  const gradeOptions = catalog?.cafeteria?.gradeOptions || [];

  const loadCatalog = useCallback(async () => {
    if (!studentId) {
      setCatalog(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await getParentPreorderCatalog({
        studentId,
        ...(categoryId ? { categoryId } : {}),
      });
      setCatalog(response.data || null);
    } catch (requestError) {
      setCatalog(requestError?.response?.data || null);
      setError(requestError?.response?.data?.message || requestError?.message || 'No se pudo cargar el menú de preórdenes.');
    } finally {
      setLoading(false);
    }
  }, [studentId, categoryId]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    setCart({});
    setSheetOpen(false);
    setEditingOrderId('');
    setSubmitError('');
    setSubmitSuccess('');
  }, [studentId]);

  useEffect(() => {
    if (!sheetOpen) {
      return undefined;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [sheetOpen]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const clearLift = () => {
      root.style.removeProperty('--preorder-sheet-lift');
    };

    if (!sheetOpen) {
      clearLift();
      return undefined;
    }

    let observer = null;
    const updateLift = () => {
      const height = sheetRef.current?.getBoundingClientRect().height || 0;
      const visible = Math.max(0, height - Number(sheetOffset || 0));
      root.style.setProperty('--preorder-sheet-lift', `${Math.round(visible + 64)}px`);
    };

    updateLift();
    if (typeof ResizeObserver === 'function' && sheetRef.current) {
      observer = new ResizeObserver(updateLift);
      observer.observe(sheetRef.current);
    }

    return () => {
      observer?.disconnect();
      clearLift();
    };
  }, [cart, editingOrderId, sheetOpen, sheetOffset]);

  useEffect(() => {
    const currentGrade = String(catalog?.student?.grade || student?.grade || '').trim();
    setGradeDraft(currentGrade);
    setEditingGrade(!catalog?.cafeteria?.confirmed);
  }, [catalog?.student?.grade, catalog?.cafeteria?.confirmed, student?.grade, studentId]);

  const selectedCategory = useMemo(
    () => (catalog?.categories || []).find((category) => String(category._id) === String(categoryId)) || null,
    [catalog?.categories, categoryId]
  );

  const addProduct = (product, quantity = 1) => {
    if (!product?.available || catalogBlockedByLimit) {
      return;
    }

    setCart((prev) => {
      const current = Number(prev[product._id]?.quantity || 0);
      const nextQty = Math.min(Number(product.stock || 0), Math.max(0, current + quantity));
      if (nextQty <= 0) {
        const next = { ...prev };
        delete next[product._id];
        return next;
      }
      return {
        ...prev,
        [product._id]: {
          productId: product._id,
          name: product.name,
          price: Number(product.price || 0),
          stock: Number(product.stock || 0),
          quantity: nextQty,
        },
      };
    });
    setSheetOpen(true);
    setSubmitError('');
    setSubmitSuccess('');
  };

  const setProductQty = (product, rawValue) => {
    if (!product?.available || catalogBlockedByLimit) {
      return;
    }
    const parsed = Number.parseInt(String(rawValue || '0'), 10);
    const nextQty = Number.isFinite(parsed) ? Math.min(Number(product.stock || 0), Math.max(0, parsed)) : 0;
    setCart((prev) => {
      if (nextQty <= 0) {
        const next = { ...prev };
        delete next[product._id];
        return next;
      }
      return {
        ...prev,
        [product._id]: {
          productId: product._id,
          name: product.name,
          price: Number(product.price || 0),
          stock: Number(product.stock || 0),
          quantity: nextQty,
        },
      };
    });
    setSheetOpen(true);
  };

  const changeCartQty = (productId, delta) => {
    setCart((prev) => {
      const current = prev[productId];
      if (!current) {
        return prev;
      }
      const nextQty = Math.min(Number(current.stock || 0), Math.max(0, Number(current.quantity || 0) + delta));
      if (nextQty <= 0) {
        const next = { ...prev };
        delete next[productId];
        return next;
      }
      return { ...prev, [productId]: { ...current, quantity: nextQty } };
    });
  };

  const onConfirmGrade = async () => {
    if (!studentId || savingLevel) {
      return;
    }
    setSavingLevel(true);
    setError('');
    try {
      const response = await updateParentPortalStudentCafeteriaLevel(studentId, {
        grade: gradeDraft,
        confirm: true,
      });
      onStudentUpdated?.(response.data?.student);
      setEditingGrade(false);
      await loadCatalog();
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo guardar el curso.');
    } finally {
      setSavingLevel(false);
    }
  };

  const onPreorder = async () => {
    const items = cartItems(cart).map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    }));
    if (!items.length || submitting) {
      return;
    }

    setSubmitting(true);
    setSubmitError('');
    setSubmitSuccess('');
    try {
      const response = editingOrderId
        ? await updateParentPreorder(editingOrderId, { studentId, items })
        : await createParentPreorder({ studentId, items });
      setCart({});
      setEditingOrderId('');
      setSheetOpen(false);
      setSubmitSuccess(response.data?.message || 'Preorden lista. El cobro se hace al entregar.');
      await loadCatalog();
    } catch (requestError) {
      setSubmitError(requestError?.response?.data?.message || (editingOrderId ? 'No se pudo actualizar la preorden.' : 'No se pudo crear la preorden.'));
    } finally {
      setSubmitting(false);
    }
  };

  const onDeletePreorder = async (preorderId = editingOrderId) => {
    if (!preorderId || submitting) {
      return;
    }

    setSubmitting(true);
    setSubmitError('');
    setSubmitSuccess('');
    try {
      const response = await deleteParentPreorder(preorderId, { studentId });
      setCart({});
      setEditingOrderId('');
      setSheetOpen(false);
      setSubmitSuccess(response.data?.message || 'Preorden eliminada.');
      await loadCatalog();
    } catch (requestError) {
      setSubmitError(requestError?.response?.data?.message || 'No se pudo eliminar la preorden.');
    } finally {
      setSubmitting(false);
    }
  };

  const onStartEdit = (order) => {
    if (!order?._id) {
      return;
    }

    const nextCart = {};
    (order.items || []).forEach((item) => {
      const productId = String(item.productId || '');
      if (!productId) {
        return;
      }
      const reserved = Number(item.quantity || 0);
      const catalogProduct = (catalog?.products || []).find((product) => String(product._id) === productId);
      nextCart[productId] = {
        productId,
        name: item.nameSnapshot || catalogProduct?.name || 'Producto',
        price: Number(item.unitPriceSnapshot ?? catalogProduct?.price ?? 0),
        stock: Number(item.availableStock || ((catalogProduct?.stock || 0) + reserved)),
        quantity: reserved,
      };
    });

    setCart(nextCart);
    setEditingOrderId(String(order._id));
    setSheetOpen(true);
    setSheetOffset(0);
    setSubmitError('');
    setSubmitSuccess('');
  };

  const onSheetTouchStart = (event) => {
    draggingRef.current = true;
    dragStartYRef.current = event.touches?.[0]?.clientY || 0;
    setSheetOffset(0);
  };

  const onSheetTouchMove = (event) => {
    if (!draggingRef.current) {
      return;
    }
    const currentY = event.touches?.[0]?.clientY || 0;
    setSheetOffset(Math.max(0, currentY - dragStartYRef.current));
  };

  const onSheetTouchEnd = () => {
    draggingRef.current = false;
    if (sheetOffset > 90) {
      setSheetOpen(false);
    }
    setSheetOffset(0);
  };

  const items = cartItems(cart);
  const total = cartTotal(cart);
  const exceedsLimit = remainingToday != null && total > remainingToday;
  const exceedsWallet = total > Number(catalog?.walletBalance || 0);

  return (
    <section className="parent-menu-page parent-preorders-page">
      {!isProductsPage ? (
        <>
          <h2>Preórdenes</h2>
          <p className="parent-menu-caption">
            Elige productos en stock de la tienda del alumno. El cobro se hace cuando el vendedor entrega el pedido.
          </p>
        </>
      ) : null}

      {!catalog?.cafeteria?.confirmed || editingGrade ? (
        <div className="parent-preorder-warning">
          <strong>Curso y tienda</strong>
          <p>
            De 1 a 5 se compra en TeachMe Primaria. De 6 a 11, en TeachMe Secundaria.
            {catalog?.cafeteria?.store?.name ? ` Tienda actual: ${catalog.cafeteria.store.name}.` : ''}
          </p>
          <div className="parent-preorder-warning-edit">
            <label>
              Curso del alumno
              <select
                onChange={(event) => setGradeDraft(event.target.value)}
                value={gradeOptions.some((option) => option.value === gradeDraft) ? gradeDraft : (gradeDraft || '')}
              >
                <option value="">Selecciona el curso</option>
                {!gradeOptions.some((option) => option.value === gradeDraft) && gradeDraft ? (
                  <option value={gradeDraft}>{gradeDraft}</option>
                ) : null}
                {gradeOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <button disabled={savingLevel || !gradeDraft} onClick={onConfirmGrade} type="button">
              {savingLevel ? 'Guardando...' : 'Confirmar curso'}
            </button>
          </div>
        </div>
      ) : null}

      {catalogBlockedByLimit ? (
        <p className="parent-error">Se alcanzó el límite diario. No se pueden agregar más productos hoy.</p>
      ) : null}
      {loading ? <p className="parent-loading">Cargando menú...</p> : null}
      {!loading && error ? <p className="parent-error">{error}</p> : null}

      {!loading && !isProductsPage ? (
        <div className="parent-categories-grid">
          {(catalog?.categories || []).map((category) => (
            <article
              className="parent-category-card"
              key={category._id}
              onClick={() => navigate(`${categoriesPath}/${encodeURIComponent(String(category._id))}`)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  navigate(`${categoriesPath}/${encodeURIComponent(String(category._id))}`);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <div className="parent-category-image-wrap">
                {category.imageUrl ? (
                  <img alt={category.name} decoding="async" loading="lazy" src={category.thumbUrl || category.imageUrl} />
                ) : (
                  <div className="parent-category-image-fallback">{String(category.name || 'C').charAt(0).toUpperCase()}</div>
                )}
              </div>
              <h3>{category.name || 'Sin nombre'}</h3>
            </article>
          ))}
          {!error && (catalog?.categories || []).length === 0 ? (
            <p className="empty">No hay categorías con productos en esta tienda.</p>
          ) : null}
        </div>
      ) : null}

      {!loading && isProductsPage ? (
        <div className="parent-menu-products-page">
          <div className="parent-menu-products-head">
            <button
              aria-label="Volver a categorías"
              className="parent-back-btn"
              onClick={() => navigate(categoriesPath)}
              type="button"
            >
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M14.7 5.3a1 1 0 0 1 0 1.4L10.4 11H20a1 1 0 1 1 0 2h-9.6l4.3 4.3a1 1 0 0 1-1.4 1.4l-6-6a1 1 0 0 1 0-1.4l6-6a1 1 0 0 1 1.4 0Z" fill="currentColor"/>
              </svg>
            </button>
            <h2>Productos</h2>
          </div>
          <p className="parent-menu-products-category">{selectedCategory?.name || 'Categoría'}</p>

          <div className="parent-products-list">
            {(catalog?.products || []).map((product) => {
              const qty = Number(cart[product._id]?.quantity || 0);
              const disabled = !product.available || catalogBlockedByLimit;
              return (
                <article className={`parent-product-row${disabled ? ' is-disabled' : ''}`} key={product._id}>
                  <div className="parent-product-thumb-wrap">
                    {product.imageUrl ? (
                      <img alt={product.name} decoding="async" loading="lazy" src={product.thumbUrl || product.imageUrl} />
                    ) : (
                      <div className="parent-product-thumb-fallback">{String(product.name || 'P').charAt(0).toUpperCase()}</div>
                    )}
                  </div>
                  <div className="parent-product-content">
                    <h3>{product.name || 'Sin nombre'}</h3>
                    <p>{product.shortDescription || (product.blocked ? 'Bloqueado por el acudiente' : product.inStock ? 'En stock' : 'Sin stock')}</p>
                    <div className="parent-product-bottom-row parent-preorder-product-actions">
                      <strong>{formatCurrency(product.price || 0)}</strong>
                      {product.blocked ? (
                        <span className="parent-block-btn is-blocked">Bloqueado</span>
                      ) : !product.inStock ? (
                        <span className="parent-block-btn is-blocked">Sin stock</span>
                      ) : catalogBlockedByLimit ? (
                        <span className="parent-block-btn is-blocked">Límite diario</span>
                      ) : (
                        <div className="parent-preorder-qty">
                          <button
                            aria-label="Quitar"
                            className="parent-preorder-step"
                            disabled={qty <= 0}
                            onClick={() => addProduct(product, -1)}
                            type="button"
                          >
                            −
                          </button>
                          <input
                            aria-label="Cantidad"
                            inputMode="numeric"
                            onChange={(event) => setProductQty(product, event.target.value)}
                            value={qty}
                          />
                          <button
                            aria-label="Sumar"
                            className="parent-preorder-step"
                            disabled={qty >= Number(product.stock || 0)}
                            onClick={() => addProduct(product, 1)}
                            type="button"
                          >
                            +
                          </button>
                          <button
                            className="parent-preorder-add-btn"
                            onClick={() => (qty > 0 ? setSheetOpen(true) : addProduct(product, 1))}
                            type="button"
                          >
                            Agregar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
            {(catalog?.products || []).length === 0 ? <p className="empty">No hay productos en esta categoría para esta tienda.</p> : null}
          </div>
        </div>
      ) : null}

      {(catalog?.pendingPreorders || []).length > 0 ? (
        <div className="parent-preorder-pending">
          <h3>Pendientes de entrega</h3>
          {(catalog.pendingPreorders || []).map((order) => (
            <article key={order._id}>
              <div>
                <strong>{formatCurrency(order.total)}</strong>
                <p>{order.itemsCount} items · {order.storeName || 'Tienda'} · Sin cobrar</p>
              </div>
              <div className="parent-preorder-pending-actions">
                <button onClick={() => onStartEdit(order)} type="button">
                  Editar
                </button>
                <button
                  className="is-danger"
                  disabled={submitting}
                  onClick={() => onDeletePreorder(order._id)}
                  type="button"
                >
                  Eliminar
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {typeof document !== 'undefined' && sheetOpen && (items.length > 0 || Boolean(editingOrderId))
        ? createPortal(
          <>
            <button
              aria-label="Cerrar resumen"
              className="parent-preorder-sheet-backdrop"
              onClick={() => setSheetOpen(false)}
              type="button"
            />
            <aside
              className="parent-preorder-sheet"
              onTouchEnd={onSheetTouchEnd}
              onTouchMove={onSheetTouchMove}
              onTouchStart={onSheetTouchStart}
              ref={sheetRef}
              style={{ transform: `translateY(${sheetOffset}px)` }}
            >
              <div className="parent-preorder-sheet-handle" />
              <h3>{editingOrderId ? 'Editar preorden' : 'Tu preorden'}</h3>
              <p className="parent-preorder-sheet-copy">
                {editingOrderId
                  ? 'Cambia cantidades o baja el panel para agregar más. Sigue sin cobrarse hasta la entrega.'
                  : 'Baja este panel para seguir eligiendo. El cobro se hace cuando el vendedor entregue el pedido.'}
              </p>
              <div className="parent-preorder-sheet-body">
                <ul>
                  {items.length === 0 ? (
                    <li className="is-empty">No quedan productos. Elimina la preorden o agrega algo de nuevo.</li>
                  ) : items.map((item) => (
                    <li key={item.productId}>
                      <span>{item.name}</span>
                      <div className="parent-preorder-qty is-compact">
                        <button onClick={() => changeCartQty(item.productId, -1)} type="button">−</button>
                        <strong>{item.quantity}</strong>
                        <button onClick={() => changeCartQty(item.productId, 1)} type="button">+</button>
                      </div>
                      <em>{formatCurrency(item.price * item.quantity)}</em>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="parent-preorder-sheet-footer">
                <div className="parent-preorder-sheet-total">
                  <span>Total</span>
                  <strong>{formatCurrency(total)}</strong>
                </div>
                {exceedsLimit ? <p className="parent-error">Esta preorden supera el límite diario.</p> : null}
                {exceedsWallet ? <p className="parent-error">Saldo insuficiente. Debe haber saldo para cobrarlo al entregar.</p> : null}
                {submitError ? <p className="parent-error">{submitError}</p> : null}
                {submitSuccess ? <p className="parent-success">{submitSuccess}</p> : null}
                {items.length > 0 ? (
                  <button
                    className="parent-preorder-submit"
                    disabled={submitting || exceedsLimit || exceedsWallet}
                    onClick={onPreorder}
                    type="button"
                  >
                    {submitting ? 'Guardando...' : (editingOrderId ? 'Guardar cambios' : 'Preordenar')}
                  </button>
                ) : null}
                {editingOrderId ? (
                  <button
                    className="parent-preorder-delete"
                    disabled={submitting}
                    onClick={() => onDeletePreorder(editingOrderId)}
                    type="button"
                  >
                    {submitting ? 'Eliminando...' : 'Eliminar preorden'}
                  </button>
                ) : null}
              </div>
            </aside>
          </>,
          document.body
        )
        : null}

      {typeof document !== 'undefined' && !sheetOpen && items.length > 0
        ? createPortal(
          <button className="parent-preorder-fab" onClick={() => setSheetOpen(true)} type="button">
            {editingOrderId ? 'Seguir editando' : 'Ver preorden'} · {formatCurrency(total)}
          </button>,
          document.body
        )
        : null}
    </section>
  );
}
