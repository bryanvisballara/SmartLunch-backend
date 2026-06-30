import { useEffect, useRef } from 'react';

const BOLD_SCRIPT_SRC = 'https://checkout.bold.co/library/boldPaymentButton.js';

function ensureBoldPaymentScript() {
  if (document.querySelector('script[src*="boldPaymentButton.js"]')) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = BOLD_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('No se pudo cargar el botón de pagos Bold.'));
    document.head.appendChild(script);
  });
}

export default function BoldPaymentButton({ config, className = '' }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!config?.orderId || !config?.integritySignature || !containerRef.current) {
      return undefined;
    }

    let cancelled = false;

    const mountButton = async () => {
      try {
        await ensureBoldPaymentScript();
        if (cancelled || !containerRef.current) {
          return;
        }

        const container = containerRef.current;
        container.innerHTML = '';

        const script = document.createElement('script');
        script.setAttribute('data-bold-button', config.buttonStyle || 'dark-L');
        script.setAttribute('data-api-key', config.apiKey);
        script.setAttribute('data-amount', String(config.amount));
        script.setAttribute('data-currency', config.currency || 'COP');
        script.setAttribute('data-order-id', config.orderId);
        script.setAttribute('data-integrity-signature', config.integritySignature);
        script.setAttribute('data-redirection-url', config.redirectionUrl);
        script.setAttribute('data-description', config.description);

        if (config.customerData && typeof config.customerData === 'object') {
          script.setAttribute('data-customer-data', JSON.stringify(config.customerData));
        }

        if (config.extraData1) {
          script.setAttribute('data-extra-data-1', config.extraData1);
        }

        if (!document.querySelector('script[src*="boldPaymentButton.js"]')) {
          script.src = BOLD_SCRIPT_SRC;
        }

        container.appendChild(script);
      } catch (error) {
        console.error('[BOLD_BUTTON_MOUNT_FAILED]', error);
      }
    };

    mountButton();

    return () => {
      cancelled = true;
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [config]);

  return <div className={`bold-payment-button-mount ${className}`.trim()} ref={containerRef} />;
}
