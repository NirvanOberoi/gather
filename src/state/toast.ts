import { create } from 'zustand';

export interface Toast {
  id: number;
  message: string;
  tone: 'success' | 'error' | 'info';
  action?: { label: string; onPress: () => void };
}

interface ToastState {
  toasts: Toast[];
  show: (message: string, tone?: Toast['tone'], action?: Toast['action']) => void;
  dismiss: (id: number) => void;
}

let n = 0;
export const useToast = create<ToastState>((set, get) => ({
  toasts: [],
  show: (message, tone = 'info', action) => {
    const id = ++n;
    set({ toasts: [...get().toasts.slice(-2), { id, message, tone, action }] });
    setTimeout(() => get().dismiss(id), tone === 'error' ? 5000 : 3200);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = {
  success: (m: string, action?: Toast['action']) => useToast.getState().show(m, 'success', action),
  error: (e: unknown) => useToast.getState().show(errorMessage(e), 'error'),
  info: (m: string) => useToast.getState().show(m, 'info'),
};

export function errorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === 'string') return e;
  return 'Something went wrong. Please try again.';
}
