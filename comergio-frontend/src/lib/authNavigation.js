export const LOGIN_PATH = '/';
export const ACCOUNT_DELETED_PATH = '/cuenta-eliminada';

function redirectToPath(path) {
  if (typeof window === 'undefined') {
    return;
  }

  const targetUrl = new URL(String(path || '/'), window.location.origin).toString();
  window.location.replace(targetUrl);
}

export function redirectToLoginPage() {
  redirectToPath(LOGIN_PATH);
}

export function redirectToAccountDeletedPage() {
  redirectToPath(ACCOUNT_DELETED_PATH);
}