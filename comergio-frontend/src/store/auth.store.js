import { create } from 'zustand';
import { clearAppBadgeCount } from '../lib/appBadge.js';
import { resetQueryCache } from '../lib/queryClient.js';

function safeParse(rawValue, fallback = null) {
  if (!rawValue) {
    return fallback;
  }

  try {
    return JSON.parse(rawValue);
  } catch {
    return fallback;
  }
}

const savedUserRaw = localStorage.getItem('user');
const savedStoreRaw = localStorage.getItem('currentStore');

const useAuthStore = create((set) => ({
  token: localStorage.getItem('token') || '',
  refreshToken: localStorage.getItem('refreshToken') || '',
  user: safeParse(savedUserRaw, null),
  currentStore: safeParse(savedStoreRaw, null),
  setAuth: ({ token, refreshToken, user }) => {
    const previousUserId = String(useAuthStore.getState().user?.id || '');
    const nextUserId = String(user?.id || '');
    if (previousUserId !== nextUserId) {
      resetQueryCache();
    }

    const assignedStore = user?.role === 'vendor' ? user?.assignedStore || null : null;
    localStorage.setItem('token', token);
    localStorage.setItem('refreshToken', String(refreshToken || ''));
    localStorage.setItem('user', JSON.stringify(user || null));
    localStorage.setItem('currentStore', JSON.stringify(assignedStore));
    set({
      token,
      refreshToken: String(refreshToken || ''),
      user: user || null,
      currentStore: assignedStore,
    });
  },
  setUser: (user) => {
    const assignedStore = user?.role === 'vendor' ? user?.assignedStore || null : null;
    localStorage.setItem('user', JSON.stringify(user || null));
    localStorage.setItem('currentStore', JSON.stringify(assignedStore));
    set({ user: user || null, currentStore: assignedStore });
  },
  setCurrentStore: (store) => {
    localStorage.setItem('currentStore', JSON.stringify(store || null));
    set({ currentStore: store || null });
  },
  logout: () => {
    resetQueryCache();
    clearAppBadgeCount();
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem('currentStore');
    set({ token: '', refreshToken: '', user: null, currentStore: null });
  },
}));

export default useAuthStore;
