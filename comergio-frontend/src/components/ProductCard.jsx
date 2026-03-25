function ProductCard({
  product,
  onAdd,
  quantityInCart = 0,
  availableStock,
  forceDisabled = false,
  disabledLabel = 'No disponible',
  disabledReason = '',
}) {
  const safeStock = isFinite(Number(availableStock)) ? Number(availableStock) : Number(product.stock || 0);
  const disabled = product.status !== 'active' || forceDisabled;
  const cardClassName = `card product-card-compact ${forceDisabled ? 'product-card-blocked' : ''}`;
  const thumbSrc = product.thumbUrl || product.imageUrl || '';

  return (
    <div className={cardClassName}>
      <h4>{product.name}</h4>
      {thumbSrc ? (
        <img alt={product.name || 'Producto'} className="product-card-thumb" decoding="async" loading="lazy" src={thumbSrc} />
      ) : (
        <div className="product-card-thumb product-card-thumb-empty">Sin foto</div>
      )}
      <p>Stock: {safeStock}</p>
      {quantityInCart > 0 ? <p>En esta orden: {quantityInCart}</p> : null}
      <p className="price">${Number(product.price).toLocaleString('es-CO')}</p>
      {forceDisabled && disabledReason ? <p className="product-lock-reason">{disabledReason}</p> : null}
      <button className="btn" disabled={disabled} onClick={() => onAdd(product)} type="button">
        {disabled ? disabledLabel : 'Agregar'}
      </button>
    </div>
  );
}

export default ProductCard;
