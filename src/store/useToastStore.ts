import { create } from 'zustand';

export interface Toast {
  id: string;
  message: string;
  /** Optional undo callback — renders an Undo button */
  undoFn?: () => void;
  /** Auto-dismiss duration in ms (default 3500) */
  duration: number;
}

interface ToastState {
  toasts: Toast[];
  addToast: (opts: Omit<Toast, 'id'>) => string;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: (opts) => {
    const id = Math.random().toString(36).slice(2, 9);
    set((s) => ({
      // Keep maximum 3 visible; push oldest off the bottom
      toasts: [...s.toasts.slice(-2), { ...opts, id }],
    }));
    return id;
  },

  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
