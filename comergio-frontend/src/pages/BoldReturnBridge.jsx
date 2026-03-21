import { useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/auth.store';
import { savePostLoginRedirect } from '../lib/postLoginRedirect';

function buildParentRedirect(search) {
  const incoming = new URLSearchParams(search || '');
  const outgoing = new URLSearchParams();
  const studentId = String(incoming.get('studentId') || '').trim();
  const paymentReference = String(incoming.get('paymentReference') || incoming.get('bold-order-id') || '').trim();
  const paymentStatus = String(incoming.get('bold-tx-status') || '').trim().toLowerCase();

  if (studentId) {
    outgoing.set('studentId', studentId);
  }

  if (paymentReference) {
    outgoing.set('paymentReference', paymentReference);
  }

  if (paymentStatus) {
    outgoing.set('paymentStatus', paymentStatus);
  }

  outgoing.set('paymentSource', 'bold');

  const query = outgoing.toString();
  return query ? `/parent?${query}` : '/parent';
}

function BoldReturnBridge() {
  const location = useLocation();
  const navigate = useNavigate();
  const { token, user } = useAuthStore();
  const userRole = String(user?.role || '').trim().toLowerCase();
  const isPortalUser = Boolean(token) && (userRole === 'parent' || userRole === 'admin');
  const redirectPath = useMemo(() => buildParentRedirect(location.search), [location.search]);
  const params = useMemo(() => new URLSearchParams(location.search || ''), [location.search]);
  const paymentStatus = String(params.get('bold-tx-status') || '').trim().toLowerCase();

  useEffect(() => {
    savePostLoginRedirect(redirectPath);

    if (isPortalUser) {
      navigate(redirectPath, { replace: true });
      return;
    }

    navigate('/login', { replace: true });
  }, [isPortalUser, navigate, redirectPath]);

  const title = paymentStatus === 'approved'
    ? 'Procesando tu recarga'
    : paymentStatus === 'rejected' || paymentStatus === 'failed' || paymentStatus === 'denied'
      ? 'Pago no aprobado'
      : 'Volviendo a Comergio';

  const message = paymentStatus === 'approved'
    ? 'Te llevaremos a la billetera del alumno para actualizar el saldo.'
    : paymentStatus === 'rejected' || paymentStatus === 'failed' || paymentStatus === 'denied'
      ? 'Te redirigiremos para revisar el estado del pago desde el portal.'
      : 'Estamos retomando tu sesión para mostrarte el resultado del pago.';

  return (
    <section className="parent-topup-davi-page">
      <div className="parent-topup-davi-fee-box">
        <p style={{ fontWeight: 'bold' }}>{title}</p>
        <p>{message}</p>
      </div>
    </section>
  );
}

export default BoldReturnBridge;