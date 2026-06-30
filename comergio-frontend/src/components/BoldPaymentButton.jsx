import { useCallback, useEffect, useState } from 'react';

const BOLD_SCRIPT_SRC = 'https://checkout.bold.co/library/boldPaymentButton.js';

function waitForBoldCheckout(timeoutMs = 10000) {
  if (window.BoldCheckout) {
    return Promise.resolve(window.BoldCheckout);
  }

  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    const check = () => {
      if (window.BoldCheckout) {
        resolve(window.BoldCheckout);
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error('Bold checkout no estuvo disponible a tiempo.'));
        return;
      }

      window.setTimeout(check, 120);
    };

    if (!document.querySelector('script[src*="boldPaymentButton.js"]')) {
      const script = document.createElement('script');
      script.src = BOLD_SCRIPT_SRC;
      script.async = true;
      script.onload = check;
      script.onerror = () => reject(new Error('No se pudo cargar el botón de pagos Bold.'));
      document.head.appendChild(script);
      return;
    }

    check();
  });
}

function buildBoldCheckoutConfig(config = {}) {
  const normalizedAmount = Math.round(Number(config.amount));
  const checkoutConfig = {
    apiKey: String(config.apiKey || '').trim(),
    amount: Number.isFinite(normalizedAmount) ? String(normalizedAmount) : '',
    currency: String(config.currency || 'COP').trim(),
    orderId: String(config.orderId || config.reference || '').trim(),
    integritySignature: String(config.integritySignature || '').trim(),
    redirectionUrl: String(config.redirectionUrl || '').trim(),
    description: String(config.description || 'Recarga Comergio').trim(),
  };

  // Bold rejects http:// origins (BTN-001). Override the library default of window.location.href.
  const originUrl = String(config.originUrl || config.redirectionUrl || '').trim();
  if (originUrl) {
    checkoutConfig.originUrl = originUrl;
  }

  if (config.customerData && typeof config.customerData === 'object') {
    checkoutConfig.customerData = JSON.stringify(config.customerData);
  }

  if (config.extraData1) {
    checkoutConfig.extraData1 = String(config.extraData1).trim();
  }

  return checkoutConfig;
}

export default function BoldPaymentButton({ config, className = '' }) {
  const [ready, setReady] = useState(Boolean(window.BoldCheckout));
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;

    waitForBoldCheckout()
      .then(() => {
        if (!cancelled) {
          setReady(true);
          setLoadError('');
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setReady(false);
          setLoadError(error?.message || 'No se pudo cargar Bold.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const onOpenBoldCheckout = useCallback(async () => {
    if (!config?.orderId || !config?.integritySignature) {
      setLoadError('Falta la configuración del pago Bold.');
      return;
    }

    try {
      const BoldCheckout = await waitForBoldCheckout();
      const checkout = new BoldCheckout(buildBoldCheckoutConfig(config));
      checkout.open();
      setLoadError('');
    } catch (error) {
      setLoadError(error?.message || 'No se pudo abrir la pasarela de Bold.');
    }
  }, [config]);

  if (!config?.orderId || !config?.integritySignature) {
    return null;
  }

  return (
    <div className={`bold-payment-button-mount ${className}`.trim()}>
      <button
        className="parent-bold-checkout-btn"
        disabled={!ready}
        onClick={onOpenBoldCheckout}
        type="button"
      >
        <span>Pagar con</span>
        <strong>Bold</strong>
      </button>
      {loadError ? <p className="parent-error">{loadError}</p> : null}
    </div>
  );
}
