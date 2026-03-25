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
  hydrateFocusSessionLengthFromDb: (minutes: number) => void;
  preferencesHydrated: boolean;
  resetSettings: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      focusSessionLength: DEFAULT_FOCUS_MINUTES,
      preferencesHydrated: false,
      setFocusSessionLength: (minutes) => {
        const clamped = clampFocusMinutes(minutes);
        set({ focusSessionLength: clamped });

        void fetch('/api/users/preferences', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ focusSessionLength: clamped }),
        }).catch(() => {
          // Keep UI optimistic; silent failure avoids interrupting focus flow.
        });
      },
      hydrateFocusSessionLengthFromDb: (minutes) => set({
        focusSessionLength: clampFocusMinutes(minutes),
        preferencesHydrated: true,
      }),
      resetSettings: () => set({
        focusSessionLength: DEFAULT_FOCUS_MINUTES,
        preferencesHydrated: false,
      }),
    }),
    {
      name: 'lumina-settings',
    },
  ),
);
