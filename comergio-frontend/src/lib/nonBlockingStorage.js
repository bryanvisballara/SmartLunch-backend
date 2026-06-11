export function scheduleLocalStorageJsonSave(key, valueFactory, options = {}) {
  if (typeof window === 'undefined' || !key) {
    return () => {};
  }

  const timeout = Number(options.timeout) > 0 ? Number(options.timeout) : 1200;

  const save = () => {
    try {
      const value = typeof valueFactory === 'function' ? valueFactory() : valueFactory;
      window.localStorage.setItem(key, JSON.stringify(value));
      if (typeof options.onSaved === 'function') {
        options.onSaved(value);
      }
    } catch {
      // Storage unavailable, quota exceeded, or value not serializable.
    }
  };

  if (typeof window.requestIdleCallback === 'function') {
    const idleId = window.requestIdleCallback(save, { timeout });
    return () => window.cancelIdleCallback(idleId);
  }

  const timeoutId = window.setTimeout(save, timeout);
  return () => window.clearTimeout(timeoutId);
}