function ProductCard({
  product,
  onAdd,
  quantityInCart = 0,
  forceDisabled = false,
  disabledLabel = 'No disponible',
  disabledReason = '',
}) {
  const outOfStock = product.stock <= 0 || quantityInCart >= product.stock;
  const disabled = product.status !== 'active' || outOfStock || forceDisabled;
  const cardClassName = `card product-card-compact ${forceDisabled ? 'product-card-blocked' : ''}`;

  return (
    <div className={cardClassName}>
      <h4>{product.name}</h4>
      {product.imageUrl ? (
        <img alt={product.name || 'Producto'} className="product-card-thumb" loading="lazy" src={product.imageUrl} />
      ) : (
        <div className="product-card-thumb product-card-thumb-empty">Sin foto</div>
      )}
      <p>Stock: {product.stock}</p>
      <p className="price">${Number(product.price).toLocaleString('es-CO')}</p>
      {forceDisabled && disabledReason ? <p className="product-lock-reason">{disabledReason}</p> : null}
      <button className="btn" disabled={disabled} onClick={() => onAdd(product)} type="button">
        {disabled ? disabledLabel : 'Agregar'}
      </button>
    </div>
  );
}

export default ProductCard;
