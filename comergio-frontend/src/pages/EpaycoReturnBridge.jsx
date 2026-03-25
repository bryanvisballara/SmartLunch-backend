import { useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import useAuthStore from '../store/auth.store';
import { savePostLoginRedirect } from '../lib/postLoginRedirect';
import {
  buildComergioDeepLink,
  buildEpaycoParentRedirect,
  shouldAttemptNativeDeepLink,
} from '../lib/deepLinks';

function EpaycoReturnBridge() {
  const location = useLocation();
  const navigate = useNavigate();
  const { token, user } = useAuthStore();
  const userRole = String(user?.role || '').trim().toLowerCase();
  const isPortalUser = Boolean(token) && (userRole === 'parent' || userRole === 'admin');
  const redirectPath = useMemo(() => buildEpaycoParentRedirect(location.search), [location.search]);
  const params = useMemo(() => new URLSearchParams(location.search || ''), [location.search]);
  const paymentStatus = String(params.get('paymentStatus') || '').trim().toLowerCase();

  useEffect(() => {
    savePostLoginRedirect(redirectPath);

    if (!shouldAttemptNativeDeepLink()) {
      navigate(isPortalUser ? redirectPath : '/login', { replace: true });
      return undefined;
    }

    let fallbackTimeout = null;
    const fallbackTarget = isPortalUser ? redirectPath : '/login';
    const deepLinkUrl = buildComergioDeepLink(redirectPath);

    fallbackTimeout = window.setTimeout(() => {
      navigate(fallbackTarget, { replace: true });
    }, 1600);

    window.location.assign(deepLinkUrl);

    return () => {
      if (fallbackTimeout) {
        window.clearTimeout(fallbackTimeout);
      }
    };
  }, [isPortalUser, navigate, redirectPath]);

  const title = paymentStatus === 'approved'
    ? 'Abriendo la app de Comergio'
    : paymentStatus === 'rejected' || paymentStatus === 'failed' || paymentStatus === 'denied'
      ? 'Volviendo a Comergio'
      : 'Retomando tu pago';

  const message = paymentStatus === 'approved'
    ? 'Si la app esta instalada, volveremos automaticamente a la billetera del alumno.'
    : paymentStatus === 'rejected' || paymentStatus === 'failed' || paymentStatus === 'denied'
      ? 'Intentaremos volver a la app para mostrarte el estado del pago.'
      : 'Estamos retomando tu sesion para llevarte de nuevo al portal.';

  return (
    <section className="parent-topup-davi-page">
      <div className="parent-topup-davi-fee-box">
        <p style={{ fontWeight: 'bold' }}>{title}</p>
        <p>{message}</p>
      </div>
    </section>
  );
}

export default EpaycoReturnBridge;
