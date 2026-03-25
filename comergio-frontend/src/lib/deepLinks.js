const COMERGIO_APP_SCHEME = 'comergio';
const COMERGIO_WEB_HOST_PATTERN = /(^|\.)comergio\.com$/i;

function normalizePath(path) {
  const rawPath = String(path || '').trim();
  if (!rawPath) {
    return '/';
  }

  return rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
}

export function buildEpaycoParentRedirect(search) {
  const incoming = new URLSearchParams(search || '');
  const outgoing = new URLSearchParams();
  const studentId = String(incoming.get('studentId') || '').trim();
  const paymentReference = String(incoming.get('paymentReference') || incoming.get('ref_payco') || '').trim();
  const paymentStatus = String(incoming.get('paymentStatus') || '').trim().toLowerCase();

  if (studentId) {
    outgoing.set('studentId', studentId);
  }

  if (paymentReference) {
    outgoing.set('paymentReference', paymentReference);
  }

  if (paymentStatus) {
    outgoing.set('paymentStatus', paymentStatus);
  }

  outgoing.set('paymentSource', 'epayco');

  const query = outgoing.toString();
  return query ? `/parent?${query}` : '/parent';
}

export function buildComergioDeepLink(path) {
  const deepLink = new URL(`${COMERGIO_APP_SCHEME}://app`);
  deepLink.pathname = normalizePath(path);
  return deepLink.toString();
}

export function shouldAttemptNativeDeepLink() {
  if (typeof navigator === 'undefined') {
    return false;
  }

  return /android|iphone|ipad|ipod/i.test(String(navigator.userAgent || ''));
}

export function resolveComergioAppUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) {
    return '';
  }

  try {
    const parsed = new URL(value);
    const protocol = parsed.protocol.toLowerCase();
    const host = parsed.host.toLowerCase();

    if (protocol === `${COMERGIO_APP_SCHEME}:`) {
      const pathFromCustomScheme = parsed.pathname && parsed.pathname !== '/'
        ? parsed.pathname
        : host && host !== 'app'
          ? `/${host}`
          : '/';
      return `${normalizePath(pathFromCustomScheme)}${parsed.search}${parsed.hash}`;
    }

    if ((protocol === 'https:' || protocol === 'http:') && COMERGIO_WEB_HOST_PATTERN.test(host)) {
      return `${normalizePath(parsed.pathname)}${parsed.search}${parsed.hash}`;
    }
  } catch {
    return '';
  }

  return '';
}
