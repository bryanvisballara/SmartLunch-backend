function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCurrency(value) {
  return `$${Number(value || 0).toLocaleString('es-CO')}`;
}

function formatDateTime(value) {
  if (!value) {
    return 'N/A';
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'N/A';
  }

  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function buildSchoolBillingStatementHtml({
  schoolName = 'Colegio',
  statementNumber = '',
  generatedAt = new Date(),
  billingFor = '',
  billingResponsible = '',
  orders = [],
  totalAmount = 0,
  generatedByName = '',
}) {
  const orderRows = (orders || []).map((order) => {
    const itemsHtml = (order.items || [])
      .map((item) => `<li>${escapeHtml(item.nameSnapshot || 'Producto')} · ${Number(item.quantity || 0)} · ${formatCurrency(item.subtotal)}</li>`)
      .join('');

    return `<tr>
      <td>${escapeHtml(order.orderNumber || order.orderId || '')}</td>
      <td>${escapeHtml(order.storeName || 'N/A')}</td>
      <td>${escapeHtml(order.studentName || 'Venta externa')}</td>
      <td>${escapeHtml(order.vendorName || 'N/A')}</td>
      <td>${formatDateTime(order.createdAt)}</td>
      <td><ul class="items-list">${itemsHtml}</ul></td>
      <td>${formatCurrency(order.total)}</td>
    </tr>`;
  }).join('');

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>Cuenta de cobro ${escapeHtml(statementNumber)}</title>
    <style>
      body { font-family: Arial, sans-serif; color: #111827; margin: 32px; }
      h1 { margin: 0 0 4px; font-size: 24px; }
      h2 { margin: 0 0 18px; font-size: 16px; color: #4b5563; font-weight: 500; }
      .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 0 0 24px; }
      .meta-card { border: 1px solid #d1d5db; border-radius: 10px; padding: 12px 14px; background: #f9fafb; }
      .meta-card span { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #6b7280; margin-bottom: 4px; }
      .meta-card strong { font-size: 15px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; vertical-align: top; }
      th { background: #f3f4f6; }
      .items-list { margin: 0; padding-left: 16px; }
      .total-row { margin-top: 18px; text-align: right; font-size: 18px; }
      .footer { margin-top: 28px; font-size: 12px; color: #6b7280; }
      @media print {
        body { margin: 16px; }
      }
    </style>
  </head>
  <body>
    <h1>Cuenta de cobro colegio</h1>
    <h2>${escapeHtml(schoolName)}</h2>
    <div class="meta">
      <div class="meta-card">
        <span>Número de cuenta</span>
        <strong>${escapeHtml(statementNumber)}</strong>
      </div>
      <div class="meta-card">
        <span>Fecha de generación</span>
        <strong>${formatDateTime(generatedAt)}</strong>
      </div>
      <div class="meta-card">
        <span>Dirigido a</span>
        <strong>${escapeHtml(billingFor || 'N/A')}</strong>
      </div>
      <div class="meta-card">
        <span>Responsable</span>
        <strong>${escapeHtml(billingResponsible || 'N/A')}</strong>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Orden</th>
          <th>Tienda</th>
          <th>Alumno</th>
          <th>Vendedor</th>
          <th>Fecha</th>
          <th>Productos</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>${orderRows}</tbody>
    </table>
    <p class="total-row"><strong>Total cuenta de cobro: ${formatCurrency(totalAmount)}</strong></p>
    <p class="footer">Generada por ${escapeHtml(generatedByName || 'Administración')} · ${formatDateTime(generatedAt)}</p>
  </body>
</html>`;
}

function serializeStatementOrder(order = {}) {
  return {
    orderId: order._id,
    orderNumber: String(order.orderNumber || order._id || ''),
    storeName: String(order.storeId?.name || order.storeName || ''),
    vendorName: String(order.vendorId?.name || order.vendorId?.username || order.vendorName || ''),
    studentName: order.guestSale
      ? 'Venta externa'
      : String(order.studentId?.name || order.studentName || 'N/A'),
    total: Number(order.total || 0),
    createdAt: order.createdAt || null,
    items: (Array.isArray(order.items) ? order.items : []).map((item) => ({
      nameSnapshot: String(item?.nameSnapshot || 'Producto'),
      quantity: Number(item?.quantity || 0),
      subtotal: Number(item?.subtotal || 0),
    })),
  };
}

module.exports = {
  buildSchoolBillingStatementHtml,
  serializeStatementOrder,
  formatCurrency,
  formatDateTime,
};
