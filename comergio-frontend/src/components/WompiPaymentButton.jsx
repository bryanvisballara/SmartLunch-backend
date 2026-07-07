import { useCallback, useEffect, useState } from 'react';

const WOMPI_SCRIPT_SRC = 'https://checkout.wompi.co/widget.js';

function waitForWompiCheckout(timeoutMs = 10000) {
  if (window.WidgetCheckout) {
    return Promise.resolve(window.WidgetCheckout);
  }

  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    const check = () => {
      if (window.WidgetCheckout) {
        resolve(window.WidgetCheckout);
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error('Wompi checkout no estuvo disponible a tiempo.'));
        return;
      }

      window.setTimeout(check, 120);
    };

    if (!document.querySelector('script[src*="checkout.wompi.co/widget.js"]')) {
      const script = document.createElement('script');
      script.src = WOMPI_SCRIPT_SRC;
      script.async = true;
      script.onload = check;
      script.onerror = () => reject(new Error('No se pudo cargar la pasarela Wompi.'));
      document.head.appendChild(script);
      return;
    }

    check();
  });
}

function buildWompiCheckoutConfig(config = {}) {
  const checkoutConfig = {
    currency: String(config.currency || 'COP').trim(),
    amountInCents: Math.max(1, Math.round(Number(config.amountInCents || 0))),
    reference: String(config.reference || '').trim(),
    publicKey: String(config.publicKey || '').trim(),
    signature: {
      integrity: String(config.integritySignature || '').trim(),
    },
  };

  const redirectUrl = String(config.redirectUrl || '').trim();
  if (redirectUrl) {
    checkoutConfig.redirectUrl = redirectUrl;
  }

  if (config.customerData && typeof config.customerData === 'object') {
    checkoutConfig.customerData = config.customerData;
  }

  return checkoutConfig;
}

export default function WompiPaymentButton({
  config,
  className = '',
  label = 'Pagar con Wompi',
  onCompleted,
  onError,
}) {
  const [ready, setReady] = useState(Boolean(window.WidgetCheckout));
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;

    waitForWompiCheckout()
      .then(() => {
        if (!cancelled) {
          setReady(true);
          setLoadError('');
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setReady(false);
          setLoadError(error?.message || 'No se pudo cargar Wompi.');
          onError?.(error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [onError]);

  const onOpenWompiCheckout = useCallback(async () => {
    if (!config?.reference || !config?.integritySignature || !config?.publicKey) {
      const error = new Error('Falta la configuración del pago Wompi.');
      setLoadError(error.message);
      onError?.(error);
      return;
    }

    try {
      const WidgetCheckout = await waitForWompiCheckout();
      const checkout = new WidgetCheckout(buildWompiCheckoutConfig(config));
      checkout.open((result) => {
        const transaction = result?.transaction || null;
        if (transaction) {
          onCompleted?.(transaction);
        }
      });
      setLoadError('');
    } catch (error) {
      setLoadError(error?.message || 'No se pudo abrir la pasarela Wompi.');
      onError?.(error);
    }
  }, [config, onCompleted, onError]);

  if (!config?.reference || !config?.integritySignature || !config?.publicKey) {
    return null;
  }

  return (
    <div className={`wompi-payment-button-mount ${className}`.trim()}>
      <button
        className="matricula-flow-primary matricula-flow-primary--wompi"
        disabled={!ready}
        onClick={onOpenWompiCheckout}
        type="button"
      >
        {label}
      </button>
      {loadError ? <p className="matricula-flow-error">{loadError}</p> : null}
    </div>
  );
}
