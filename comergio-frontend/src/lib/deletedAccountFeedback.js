const STORAGE_KEY = 'deletedAccountFeedbackContext';

export function saveDeletedAccountFeedbackContext(context) {
  if (typeof window === 'undefined') {
    return;
  }

  const payload = {
    feedbackToken: String(context?.feedbackToken || '').trim(),
    deletedDisplayName: String(context?.deletedDisplayName || '').trim(),
    createdAt: Date.now(),
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function readDeletedAccountFeedbackContext() {
  if (typeof window === 'undefined') {
    return { feedbackToken: '', deletedDisplayName: '' };
  }

  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);
    if (!rawValue) {
      return { feedbackToken: '', deletedDisplayName: '' };
    }

    const parsed = JSON.parse(rawValue);
    return {
      feedbackToken: String(parsed?.feedbackToken || '').trim(),
      deletedDisplayName: String(parsed?.deletedDisplayName || '').trim(),
    };
  } catch {
    return { feedbackToken: '', deletedDisplayName: '' };
  }
}

export function clearDeletedAccountFeedbackContext() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
}
