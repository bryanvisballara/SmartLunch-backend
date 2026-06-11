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
  const paymentReference = String(
    incoming.get('paymentReference')
    || incoming.get('x_id_invoice')
    || incoming.get('x_invoice')
    || incoming.get('invoice')
    || incoming.get('reference')
    || ''
  ).trim();
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
  outgoing.set('returnSource', 'epayco-button');

  const query = outgoing.toString();
  return query ? `/parent/recargas?${query}` : '/parent/recargas';
}

export function buildComergioDeepLink(path) {
  const normalized = String(path || '').trim();
  const deepLink = new URL(`${COMERGIO_APP_SCHEME}://app`);

  try {
    const parsedPath = new URL(normalized, 'https://comergio.app');
    deepLink.pathname = normalizePath(parsedPath.pathname);
    deepLink.search = parsedPath.search;
    deepLink.hash = parsedPath.hash;
  } catch {
    deepLink.pathname = normalizePath(normalized);
  }

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
      let pathFromCustomScheme = parsed.pathname && parsed.pathname !== '/'
        ? parsed.pathname
        : host && host !== 'app'
          ? `/${host}`
          : '/';
      let searchFromCustomScheme = parsed.search;
      let hashFromCustomScheme = parsed.hash;

      // Backward compatibility for previously malformed deep links where
      // the query string was percent-encoded into the pathname.
      if (!searchFromCustomScheme && pathFromCustomScheme.includes('%3F')) {
        const decodedPath = decodeURIComponent(pathFromCustomScheme);
        const questionMarkIndex = decodedPath.indexOf('?');

        if (questionMarkIndex >= 0) {
          pathFromCustomScheme = decodedPath.slice(0, questionMarkIndex) || '/';
          searchFromCustomScheme = decodedPath.slice(questionMarkIndex);
        }
      }

      if (!searchFromCustomScheme && pathFromCustomScheme.includes('?')) {
        const questionMarkIndex = pathFromCustomScheme.indexOf('?');
        searchFromCustomScheme = pathFromCustomScheme.slice(questionMarkIndex);
        pathFromCustomScheme = pathFromCustomScheme.slice(0, questionMarkIndex) || '/';
      }

      return `${normalizePath(pathFromCustomScheme)}${searchFromCustomScheme}${hashFromCustomScheme}`;
    }

    if ((protocol === 'https:' || protocol === 'http:') && COMERGIO_WEB_HOST_PATTERN.test(host)) {
      return `${normalizePath(parsed.pathname)}${parsed.search}${parsed.hash}`;
    }
  } catch {
    return '';
  }

  return '';
}
