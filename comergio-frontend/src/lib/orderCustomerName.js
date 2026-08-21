export function formatOrderCustomerName(order = {}) {
  const studentName = String(order?.studentId?.name || '').trim();
  if (studentName) {
    return studentName;
  }

  const guestName = String(order?.guestName || '').trim();
  if (order?.guestSale) {
    return guestName || 'Sin nombre';
  }

  return guestName || 'Sin alumno';
}

export function formatOrderTicketNumber(id) {
  if (!id) {
    return '-';
  }

  return `#${String(id).slice(-8).toUpperCase()}`;
}
