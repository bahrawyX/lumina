import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type FocusPreference = 'morning' | 'midday' | 'evening' | 'none';
export type FocusSessionLength = '25/5' | '50/10' | '90/20' | 'custom';
export type FocusGoal =
  | 'deep-work'
  | 'better-scheduling'
  | 'reduce-switching'
  | 'daily-tracking';

export interface OnboardingState {
  completed: boolean;
  step: number;

  // Step 1 — About You
  userName: string;
  userRole: string;

  // Step 2 — Work Schedule
  workStart: string;       // e.g. "09:00"
  workEnd: string;         // e.g. "17:00"
  timezone: string;

  // Step 3 — Focus Preference
  focusPreference: FocusPreference;

  // Step 4 — Session Length
  focusSessionLength: FocusSessionLength;
  customFocusMinutes: number;
  customBreakMinutes: number;

  // Step 5 — Calendar Sync (independent per-provider booleans)
  googleConnected: boolean;
  microsoftConnected: boolean;

  // Step 6 — Goals
  focusGoals: FocusGoal[];

  // Actions
  setStep: (step: number) => void;
  setWorkSchedule: (start: string, end: string, tz?: string) => void;
  setFocusPreference: (pref: FocusPreference) => void;
  setFocusSessionLength: (len: FocusSessionLength, customMin?: number, customBreak?: number) => void;
  setUserInfo: (name: string, role: string) => void;
  setGoogleConnected: (connected: boolean) => void;
  setMicrosoftConnected: (connected: boolean) => void;
  toggleFocusGoal: (goal: FocusGoal) => void;
  complete: () => void;
  reset: () => void;
}

const DETECTED_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      completed: false,
      step: 0,
      userName: '',
      userRole: '',
      workStart: '09:00',
      workEnd: '17:00',
      timezone: DETECTED_TZ,
      focusPreference: 'none',
      focusSessionLength: '50/10',
      customFocusMinutes: 60,
      customBreakMinutes: 15,
      googleConnected: false,
      microsoftConnected: false,
      focusGoals: [],

      setStep: (step) => set({ step }),
      setUserInfo: (name, role) => set({ userName: name, userRole: role }),
      setWorkSchedule: (start, end, tz) =>
        set({ workStart: start, workEnd: end, ...(tz ? { timezone: tz } : {}) }),
      setFocusPreference: (focusPreference) => set({ focusPreference }),
      setFocusSessionLength: (len, customMin, customBreak) =>
        set({
          focusSessionLength: len,
          ...(customMin !== undefined ? { customFocusMinutes: customMin } : {}),
          ...(customBreak !== undefined ? { customBreakMinutes: customBreak } : {}),
        }),
      setGoogleConnected: (connected) => set({ googleConnected: connected }),
      setMicrosoftConnected: (connected) => set({ microsoftConnected: connected }),
      toggleFocusGoal: (goal) => {
        const current = get().focusGoals;
        set({
          focusGoals: current.includes(goal)
            ? current.filter((g) => g !== goal)
            : [...current, goal],
        });
      },
      complete: () => set({ completed: true }),
      reset: () =>
        set({
          completed: false,
          step: 0,
          userName: '',
          userRole: '',
          workStart: '09:00',
          workEnd: '17:00',
          timezone: DETECTED_TZ,
          focusPreference: 'none',
          focusSessionLength: '50/10',
          customFocusMinutes: 60,
          customBreakMinutes: 15,
          googleConnected: false,
          microsoftConnected: false,
          focusGoals: [],
        }),
    }),
    {
      name: 'lumina-onboarding',
    }
  )
);
