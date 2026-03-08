import { create } from 'zustand';

const savedUserRaw = localStorage.getItem('user');
const savedStoreRaw = localStorage.getItem('currentStore');

const useAuthStore = create((set) => ({
  token: localStorage.getItem('token') || '',
  user: savedUserRaw ? JSON.parse(savedUserRaw) : null,
  currentStore: savedStoreRaw ? JSON.parse(savedStoreRaw) : null,
  setAuth: ({ token, user }) => {
    const assignedStore = user?.role === 'vendor' ? user?.assignedStore || null : null;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user || null));
    localStorage.setItem('currentStore', JSON.stringify(assignedStore));
    set({ token, user: user || null, currentStore: assignedStore });
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
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('currentStore');
    set({ token: '', user: null, currentStore: null });
  },
}));

export default useAuthStore;
