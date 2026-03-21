const STORAGE_KEY = 'comergio:post-login-redirect';
const MAX_AGE_MS = 30 * 60 * 1000;

function parseStoredRedirect() {
  const rawValue = localStorage.getItem(STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue);
    const path = String(parsed?.path || '').trim();
    const createdAt = Number(parsed?.createdAt || 0);

    if (!path || !createdAt || Date.now() - createdAt > MAX_AGE_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return { path, createdAt };
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function savePostLoginRedirect(path) {
  const normalizedPath = String(path || '').trim();
  if (!normalizedPath) {
    return;
  }

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      path: normalizedPath,
      createdAt: Date.now(),
    })
  );
}

export function peekPostLoginRedirect() {
  return parseStoredRedirect()?.path || '';
}

export function consumePostLoginRedirect() {
  const pendingPath = peekPostLoginRedirect();
  if (pendingPath) {
    localStorage.removeItem(STORAGE_KEY);
  }
  return pendingPath;
}