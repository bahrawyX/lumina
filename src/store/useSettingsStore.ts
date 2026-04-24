import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const MIN_FOCUS_MINUTES = 5;
const MAX_FOCUS_MINUTES = 240;
const DEFAULT_FOCUS_MINUTES = 25;

function clampFocusMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return DEFAULT_FOCUS_MINUTES;
  return Math.max(MIN_FOCUS_MINUTES, Math.min(MAX_FOCUS_MINUTES, Math.round(minutes)));
}

type NotificationPreferences = {
  dailyBrief: boolean;
  eventReminders: boolean;
  streakReminder: boolean;
  taskReminders: boolean;
  focusComplete: boolean;
};

const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = {
  dailyBrief: true,
  eventReminders: true,
  streakReminder: true,
  taskReminders: true,
  focusComplete: false,
};

interface SettingsState {
  focusSessionLength: number;
  timezone: string;
  notificationPreferences: NotificationPreferences;
  workStart: string;
  workEnd: string;
  preferencesHydrated: boolean;

  setFocusSessionLength: (minutes: number) => void;
  setTimezone: (tz: string) => void;
  setNotificationPreferences: (prefs: Partial<NotificationPreferences>) => void;
  setWorkHours: (workStart: string, workEnd: string) => void;
  hydratePreferencesFromDb: (prefs: {
    focusSessionLength?: number;
    timezone?: string;
    notificationPreferences?: NotificationPreferences;
    workStart?: string;
    workEnd?: string;
  }) => void;
  /** @deprecated use hydratePreferencesFromDb */
  hydrateFocusSessionLengthFromDb: (minutes: number) => void;
  resetSettings: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      focusSessionLength: DEFAULT_FOCUS_MINUTES,
      timezone: 'UTC',
      notificationPreferences: DEFAULT_NOTIFICATION_PREFS,
      workStart: '09:00',
      workEnd: '17:00',
      preferencesHydrated: false,

      setFocusSessionLength: (minutes) => {
        const clamped = clampFocusMinutes(minutes);
        set({ focusSessionLength: clamped, preferencesHydrated: true });
        void fetch('/api/users/preferences', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ focusSessionLength: clamped }),
        }).catch(() => {});
      },

      setTimezone: (tz) => {
        set({ timezone: tz, preferencesHydrated: true });
        void fetch('/api/users/notification-preferences', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timezone: tz }),
        }).catch(() => {});
      },

      setNotificationPreferences: (partial) => {
        const merged = { ...get().notificationPreferences, ...partial };
        set({ notificationPreferences: merged, preferencesHydrated: true });
        void fetch('/api/users/notification-preferences', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(merged),
        }).catch(() => {});
      },

      setWorkHours: (workStart, workEnd) => {
        set({ workStart, workEnd, preferencesHydrated: true });
        void fetch('/api/users/preferences', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workStart, workEnd }),
        }).catch(() => {});
      },

      hydratePreferencesFromDb: (prefs) => {
        set({
          ...(typeof prefs.focusSessionLength === 'number' && {
            focusSessionLength: clampFocusMinutes(prefs.focusSessionLength),
          }),
          ...(typeof prefs.timezone === 'string' && { timezone: prefs.timezone }),
          ...(prefs.notificationPreferences && {
            notificationPreferences: { ...DEFAULT_NOTIFICATION_PREFS, ...prefs.notificationPreferences },
          }),
          ...(typeof prefs.workStart === 'string' && { workStart: prefs.workStart }),
          ...(typeof prefs.workEnd === 'string' && { workEnd: prefs.workEnd }),
          preferencesHydrated: true,
        });
      },

      hydrateFocusSessionLengthFromDb: (minutes) => {
        set({ focusSessionLength: clampFocusMinutes(minutes), preferencesHydrated: true });
      },

      resetSettings: () => set({
        focusSessionLength: DEFAULT_FOCUS_MINUTES,
        timezone: 'UTC',
        notificationPreferences: DEFAULT_NOTIFICATION_PREFS,
        workStart: '09:00',
        workEnd: '17:00',
        preferencesHydrated: false,
      }),
    }),
    { name: 'lumina-settings' },
  ),
);
