function ProductCard({
  product,
  onAdd,
  quantityInCart = 0,
  availableStock,
  forceDisabled = false,
  disabledLabel = 'No disponible',
  disabledReason = '',
}) {
  const safeStock = Number.isFinite(Number(availableStock)) ? Math.max(0, Number(availableStock)) : Math.max(0, Number(product.stock || 0));
  const outOfStock = safeStock <= 0;
  const disabled = product.status !== 'active' || forceDisabled || outOfStock;
  const cardClassName = `card product-card-compact ${forceDisabled ? 'product-card-blocked' : ''}`;
  const thumbSrc = product.thumbUrl || product.imageUrl || '';
  const finalDisabledLabel = outOfStock ? 'Sin stock' : disabledLabel;

  return (
    <div className={cardClassName}>
      <h4>{product.name}</h4>
      {thumbSrc ? (
        <img alt={product.name || 'Producto'} className="product-card-thumb" decoding="async" loading="lazy" src={thumbSrc} />
      ) : (
        <div className="product-card-thumb product-card-thumb-empty">Sin foto</div>
      )}
      <p>Stock: {safeStock}</p>
      <p className="price">${Number(product.price).toLocaleString('es-CO')}</p>
      {forceDisabled && disabledReason ? <p className="product-lock-reason">{disabledReason}</p> : null}
      <button className="btn" disabled={disabled} onClick={() => onAdd(product)} type="button">
        {disabled ? finalDisabledLabel : 'Agregar'}
      </button>
    </div>
  );
}

export default ProductCard;
