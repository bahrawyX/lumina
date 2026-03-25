import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const MIN_FOCUS_MINUTES = 5;
const MAX_FOCUS_MINUTES = 240;
const DEFAULT_FOCUS_MINUTES = 25;

function clampFocusMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return DEFAULT_FOCUS_MINUTES;
  return Math.max(MIN_FOCUS_MINUTES, Math.min(MAX_FOCUS_MINUTES, Math.round(minutes)));
}

interface SettingsState {
  focusSessionLength: number;
  setFocusSessionLength: (minutes: number) => void;
  resetSettings: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      focusSessionLength: DEFAULT_FOCUS_MINUTES,
      setFocusSessionLength: (minutes) => set({ focusSessionLength: clampFocusMinutes(minutes) }),
      resetSettings: () => set({ focusSessionLength: DEFAULT_FOCUS_MINUTES }),
    }),
    {
      name: 'lumina-settings',
    },
  ),
);
