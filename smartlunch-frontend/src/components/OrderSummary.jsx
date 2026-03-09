const PAYMENT_OPTIONS = [
  { value: 'system', label: 'Saldo SmartLunch' },
  { value: 'cash', label: 'Efectivo' },
  { value: 'qr', label: 'QR' },
  { value: 'dataphone', label: 'Datáfono' },
  { value: 'school_billing', label: 'Cuenta de cobro colegio' },
];

function OrderSummary({
  items,
  onRemoveItem,
  onChangeQuantity,
  onSubmit,
  loading,
  disabled = false,
  paymentMethod = 'system',
  onPaymentMethodChange,
  disabledPaymentMethods = [],
  cashTendered = '',
  onCashTenderedChange,
  schoolBillingFor = '',
  onSchoolBillingForChange,
  schoolBillingResponsible = '',
  onSchoolBillingResponsibleChange,
}) {
  const total = items.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const cashTenderedValue = Number(cashTendered || 0);
  const cashDiff = cashTenderedValue - total;
  const hasCashValue = String(cashTendered || '').trim() !== '';

  return (
    <div className="panel order-summary-panel">
      <h3>Resumen de orden</h3>
      {items.length === 0 ? <p>No hay productos seleccionados.</p> : null}
      {items.map((item) => (
        <div className="order-item-card" key={item._id}>
          <div className="order-item-main">
            <p className="order-item-title">
              {item.name} x{item.quantity}
            </p>
            <p className="order-item-price">${Number(item.price * item.quantity).toLocaleString('es-CO')}</p>
            <div className="qty-controls">
              <button
                className="qty-btn"
                onClick={() => onChangeQuantity?.(item._id, -1)}
                type="button"
              >
                -
              </button>
              <span>{item.quantity}</span>
              <button
                className="qty-btn"
                onClick={() => onChangeQuantity?.(item._id, 1)}
                type="button"
              >
                +
              </button>
            </div>
          </div>
          <button
            aria-label={`Quitar ${item.name}`}
            className="order-item-remove"
            onClick={() => onRemoveItem?.(item._id)}
            type="button"
          >
            X
          </button>
        </div>
      ))}
      <hr />
      <div className="row strong">
        <span>Total</span>
        <span>${Number(total).toLocaleString('es-CO')}</span>
      </div>
      <div className="payment-method-wrap">
        <p>Forma de pago</p>
        <div className="payment-options">
          {PAYMENT_OPTIONS.map((option) => (
            <label className="payment-option" key={option.value}>
              <input
                checked={paymentMethod === option.value}
                disabled={disabledPaymentMethods.includes(option.value)}
                name="paymentMethod"
                onChange={() => onPaymentMethodChange?.(option.value)}
                type="radio"
                value={option.value}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </div>

      {paymentMethod === 'cash' ? (
        <div className="cash-change-panel">
          <label>
            Billete recibido
            <input
              type="number"
              min="0"
              step="100"
              value={cashTendered}
              onChange={(event) => onCashTenderedChange?.(event.target.value)}
              placeholder="Ej: 10000"
            />
          </label>
          {hasCashValue ? (
            <p className="cash-change-result">
              {cashDiff >= 0
                ? `Vuelto: $${Number(cashDiff).toLocaleString('es-CO')}`
                : `Falta: $${Number(Math.abs(cashDiff)).toLocaleString('es-CO')}`}
            </p>
          ) : (
            <p className="cash-change-result">Ingresa el billete para calcular el vuelto.</p>
          )}
        </div>
      ) : null}

      {paymentMethod === 'school_billing' ? (
        <div className="cash-change-panel">
          <label>
            Dirigido a
            <input
              type="text"
              value={schoolBillingFor}
              onChange={(event) => onSchoolBillingForChange?.(event.target.value)}
              placeholder="Ej: Coordinación académica"
            />
          </label>
          <label>
            Responsable
            <input
              type="text"
              value={schoolBillingResponsible}
              onChange={(event) => onSchoolBillingResponsibleChange?.(event.target.value)}
              placeholder="Ej: Nombre del responsable"
            />
          </label>
        </div>
      ) : null}

      <button className="btn btn-primary order-summary-submit" disabled={loading || items.length === 0 || disabled} onClick={onSubmit} type="button">
        {loading ? 'Procesando...' : 'Cobrar'}
      </button>
    </div>
  );
}

export default OrderSummary;
