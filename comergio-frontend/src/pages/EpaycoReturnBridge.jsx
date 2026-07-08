import { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import useAuthStore from '../store/auth.store';
import { savePostLoginRedirect } from '../lib/postLoginRedirect';
import loginLogo from '../assets/logonuevo.png';
import {
  buildComergioDeepLink,
  buildEpaycoParentRedirect,
  shouldAttemptNativeDeepLink,
} from '../lib/deepLinks';
import { LOGIN_PATH } from '../lib/authNavigation';

function EpaycoReturnBridge() {
  const location = useLocation();
  const navigate = useNavigate();
  const { token, user } = useAuthStore();
  const userRole = String(user?.role || '').trim().toLowerCase();
  const isPortalUser = Boolean(token) && (userRole === 'parent' || userRole === 'admin');
  const redirectPath = useMemo(() => buildEpaycoParentRedirect(location.search), [location.search]);
  const params = useMemo(() => new URLSearchParams(location.search || ''), [location.search]);
  const paymentStatus = String(params.get('paymentStatus') || '').trim().toLowerCase();
  const isBackReturn = paymentStatus === 'abandoned';

  const fallbackTarget = isPortalUser ? redirectPath : LOGIN_PATH;
  const deepLinkUrl = buildComergioDeepLink(redirectPath);
  savePostLoginRedirect(redirectPath);

  const onOpenComergio = () => {
    if (shouldAttemptNativeDeepLink()) {
      window.location.assign(deepLinkUrl);
      return;
    }

    navigate(fallbackTarget, { replace: true });
  };

  const title = paymentStatus === 'approved'
    ? 'Tu pago ya fue procesado'
    : isBackReturn
      ? 'Has salido del proceso de pago en ePayco'
    : paymentStatus === 'rejected' || paymentStatus === 'failed' || paymentStatus === 'denied'
      ? 'Tu transaccion no fue aprobada'
      : 'Estamos retomando tu pago';

  const message = paymentStatus === 'approved'
    ? 'Para consultar el saldo definitivo, vuelve a Comergio y actualiza la pantalla de recargas.'
    : isBackReturn
      ? 'Para consultar el estado definitivo de tu transaccion, regresa a la app de Comergio y actualiza la pantalla de recargas.'
    : paymentStatus === 'rejected' || paymentStatus === 'failed' || paymentStatus === 'denied'
      ? 'La billetera no recibio saldo nuevo. Vuelve a Comergio para revisar el estado final de la transaccion.'
      : 'Estamos retomando tu sesion para que puedas volver a Comergio cuando lo necesites.';

  return (
    <section className={`epayco-return-page${isBackReturn ? ' epayco-return-page-back' : ''}`} aria-label="Retorno de ePayco a Comergio">
      <div className="epayco-return-card">
        <div className="epayco-return-glow" aria-hidden="true" />
        <div className="epayco-return-logo-shell">
          <img className="epayco-return-logo" src={loginLogo} alt="Comergio" />
        </div>
        <span className="epayco-return-chip">
          {paymentStatus === 'approved' ? 'Pago aprobado' : isBackReturn ? 'Transaccion finalizada' : 'Estado de la transaccion'}
        </span>
        <h1>{title}</h1>
        <p className="epayco-return-lead">{message}</p>
        <div className="epayco-return-message-box">
          <strong>Recomendacion</strong>
          <p>
            Si el pago fue aprobado, la billetera puede tardar unos instantes en reflejar el resultado mientras validamos la transaccion.
          </p>
        </div>
        <button className="epayco-return-primary" type="button" onClick={onOpenComergio}>
          Volver a Comergio
        </button>
        <p className="epayco-return-footnote">
          Si la app ya esta abierta, solo vuelve a Comergio y desliza para refrescar la informacion.
        </p>
      </div>
    </section>
  );
}

export default EpaycoReturnBridge;
