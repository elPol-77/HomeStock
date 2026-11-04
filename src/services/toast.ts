import { create } from 'zustand';

export type ToastTone = 'success' | 'info' | 'warning' | 'danger';

export interface ToastMessage {
  id: number;
  text: string;
  tone: ToastTone;
  action?: { label: string; onPress: () => void };
}

interface ToastStore {
  current: ToastMessage | null;
  show: (text: string, tone?: ToastTone, action?: ToastMessage['action']) => void;
  hide: () => void;
}

let seq = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

export const useToast = create<ToastStore>((set) => ({
  current: null,
  show: (text, tone = 'success', action) => {
    if (timer) clearTimeout(timer);
    set({ current: { id: ++seq, text, tone, action } });
    timer = setTimeout(() => set({ current: null }), action ? 5000 : 2600);
  },
  hide: () => set({ current: null }),
}));

export const toast = (text: string, tone?: ToastTone, action?: ToastMessage['action']) => useToast.getState().show(text, tone, action);
