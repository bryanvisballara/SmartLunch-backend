import { useCallback, useEffect, useState } from 'react';

const WOMPI_WEB_CHECKOUT_URL = 'https://checkout.wompi.co/p/';
const WOMPI_SCRIPT_SRC = 'https://checkout.wompi.co/widget.js';

function appendHiddenField(form, name, value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return;
  }

  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = name;
  input.value = String(value);
  form.appendChild(input);
}

export function launchWompiWebCheckout(checkout = {}) {
  const form = document.createElement('form');
  form.method = 'GET';
  form.action = WOMPI_WEB_CHECKOUT_URL;
  form.style.display = 'none';

  appendHiddenField(form, 'public-key', checkout.publicKey);
  appendHiddenField(form, 'currency', checkout.currency || 'COP');
  appendHiddenField(form, 'amount-in-cents', checkout.amountInCents);
  appendHiddenField(form, 'reference', checkout.reference);
  appendHiddenField(form, 'signature:integrity', checkout.integritySignature);
  appendHiddenField(form, 'redirect-url', checkout.redirectUrl);

  const customer = checkout.customerData || {};
  appendHiddenField(form, 'customer-data:email', customer.email);
  appendHiddenField(form, 'customer-data:full-name', customer.fullName);
  appendHiddenField(form, 'customer-data:phone-number', customer.phoneNumber);
  appendHiddenField(form, 'customer-data:phone-number-prefix', customer.phoneNumberPrefix || '+57');
  appendHiddenField(form, 'customer-data:legal-id', customer.legalId);
  appendHiddenField(form, 'customer-data:legal-id-type', customer.legalIdType);

  document.body.appendChild(form);
  form.submit();
  form.remove();
}

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

function buildWompiWidgetConfig(config = {}) {
  return {
    currency: String(config.currency || 'COP').trim(),
    amountInCents: Math.max(1, Math.round(Number(config.amountInCents || 0))),
    reference: String(config.reference || '').trim(),
    publicKey: String(config.publicKey || '').trim(),
    signature: {
      integrity: String(config.integritySignature || '').trim(),
    },
    redirectUrl: String(config.redirectUrl || '').trim() || undefined,
    customerData: config.customerData || undefined,
  };
}

export default function WompiPaymentButton({
  config,
  className = '',
  label = 'Pagar con Wompi',
  mode = 'redirect',
  onCompleted,
  onError,
}) {
  const [ready, setReady] = useState(mode === 'redirect');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (mode === 'redirect') {
      return undefined;
    }

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
  }, [mode, onError]);

  const onLaunchCheckout = useCallback(async () => {
    if (!config?.reference || !config?.integritySignature || !config?.publicKey) {
      const error = new Error('Falta la configuración del pago Wompi.');
      setLoadError(error.message);
      onError?.(error);
      return;
    }

    if (mode === 'redirect') {
      launchWompiWebCheckout(config);
      return;
    }

    try {
      const WidgetCheckout = await waitForWompiCheckout();
      const checkout = new WidgetCheckout(buildWompiWidgetConfig(config));
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
  }, [config, mode, onCompleted, onError]);

  if (!config?.reference || !config?.integritySignature || !config?.publicKey) {
    return null;
  }

  return (
    <div className={`wompi-payment-button-mount ${className}`.trim()}>
      <button
        className="matricula-flow-primary matricula-flow-primary--wompi"
        disabled={!ready}
        onClick={onLaunchCheckout}
        type="button"
      >
        {label}
      </button>
      {loadError ? <p className="matricula-flow-error">{loadError}</p> : null}
    </div>
  );
}
