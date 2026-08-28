import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useEffect, useState } from 'react';

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
  /**
   * Adopt the server's record. Called from `PersistenceBootstrap` with the
   * payload from `/api/users/preferences`.
   */
  hydrateFromServer: (server: {
    onboardingCompleted: boolean;
    userRole?: string;
    workStart?: string;
    workEnd?: string;
    timezone?: string;
  }) => void;
}

const DETECTED_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const DEFAULT_WORK_START = '09:00';
const DEFAULT_WORK_END = '17:00';

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      completed: false,
      step: 0,
      userName: '',
      userRole: '',
      workStart: DEFAULT_WORK_START,
      workEnd: DEFAULT_WORK_END,
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
      /**
       * Mark onboarding done, locally AND on the server.
       *
       * The durable record is `users.onboarding_completed_at`. localStorage was
       * previously the ONLY trace, so a returning user on a new device, a
       * cleared browser or a private window was force-marched through the whole
       * flow again — overwriting the `workStart`/`workEnd`/`timezone` they had
       * already set, every time.
       *
       * The collected preferences go up in the same request, so the profile the
       * user just entered is what the server has.
       */
      complete: () => {
        set({ completed: true });
        const s = get();
        void fetch('/api/users/preferences', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            onboardingCompleted: true,
            userRole: s.userRole,
            workStart: s.workStart,
            workEnd: s.workEnd,
            timezone: s.timezone,
          }),
        }).catch(() => {
          // Non-fatal: the local flag still lets this device through, and the
          // next successful preferences PATCH re-sends it. Failing the whole
          // onboarding on a flaky request would be worse.
        });
      },

      hydrateFromServer: ({ onboardingCompleted, userRole, workStart, workEnd, timezone }) => {
        const current = get();

        /**
         * The server wins over an untouched default; the local value wins if
         * the user actually changed it.
         *
         * Comparing against the default is the only way to tell "the user set
         * 09:00" from "nobody has set anything and 09:00 is what the store
         * starts with". Treating every non-empty local value as user intent
         * would mean a returning user's real 10:00 start could never load,
         * because the default 09:00 always looked like a deliberate choice.
         */
        const adopt = <T,>(local: T, fallback: T, server: T | undefined): T =>
          local !== fallback ? local : (server ?? fallback);

        set({
          // The server is authoritative for completion, in BOTH directions.
          //
          // This used to be `current.completed || onboardingCompleted`, under a
          // comment claiming server authority — but `||` only ever lets the
          // server turn completion ON. A stale local `true` could never be
          // corrected, which is the whole of F8.1's second consequence: a guest
          // finishes onboarding locally, signs up, and their brand-new account
          // (`onboarding_completed_at IS NULL`) skips the flow entirely,
          // because the guest's flag is still sitting in this browser.
          //
          // There is no ambiguity to protect against here. The route computes
          // `onboardingCompleted: row.onboardingCompletedAt !== null` from the
          // account row, so `false` means "this account has not onboarded",
          // never "we don't know". And this hydration runs from
          // `PersistenceBootstrap`, which `/onboarding` does not mount — so it
          // cannot race a completion the user is performing right now.
          completed: onboardingCompleted,
          userRole: adopt(current.userRole, '', userRole),
          workStart: adopt(current.workStart, DEFAULT_WORK_START, workStart),
          workEnd: adopt(current.workEnd, DEFAULT_WORK_END, workEnd),
          timezone: adopt(current.timezone, DETECTED_TZ, timezone),
        });
      },
      reset: () =>
        set({
          completed: false,
          step: 0,
          userName: '',
          userRole: '',
          workStart: DEFAULT_WORK_START,
          workEnd: DEFAULT_WORK_END,
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
      version: 1,
      // Persisted stores had no `version` and no `migrate`, so `persist`
      // shallow-merged whatever JSON was in localStorage over the current
      // defaults with zero validation. A field whose type changed between
      // deploys rehydrated as the stale shape and reached code expecting the
      // new one — a white screen for RETURNING users only, invisible in CI and
      // in any fresh browser.
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<OnboardingState>;
        if (version >= 1) return state;
        return {
          ...state,
          // v0 stored these as free-form values with no guarantee of shape.
          focusGoals: Array.isArray(state.focusGoals) ? state.focusGoals : [],
          timezone: typeof state.timezone === 'string' ? state.timezone : DETECTED_TZ,
        };
      },

      /**
       * P3-9: `googleConnected` / `microsoftConnected` used to persist.
       *
       * They mirror server state, and nothing in the sidebar's disconnect path
       * wrote them — so disconnecting Google left `googleConnected: true` in
       * localStorage, and the onboarding flow showed a stale "Connected" badge
       * that survived every reload. A cached copy of a server fact is exactly
       * the thing that goes stale.
       *
       * They are still in the store (the onboarding flow sets them the moment
       * its own OAuth popup returns, before any refetch), but they now start
       * `false` on every load and are reconciled by
       * `refreshIntegrationStatus`, which reads `/api/integrations/status`.
       */
      partialize: (state) =>
        // An explicit allowlist rather than an omit, so a field added to the
        // store tomorrow is not persisted by accident.
        ({
          completed: state.completed,
          step: state.step,
          userName: state.userName,
          userRole: state.userRole,
          workStart: state.workStart,
          workEnd: state.workEnd,
          timezone: state.timezone,
          focusPreference: state.focusPreference,
          focusSessionLength: state.focusSessionLength,
          customFocusMinutes: state.customFocusMinutes,
          customBreakMinutes: state.customBreakMinutes,
          focusGoals: state.focusGoals,
          // `as` because `partialize` narrows the persisted-state type while
          // `migrate` above is typed against the full state. Dropping two
          // server-derived booleans does not change the shape `migrate` reads.
        }) as unknown as OnboardingState,
    }
  )
);

/**
 * Returns true once the persist middleware has finished reading localStorage.
 * Use this to gate any redirect logic so it never runs against the un-hydrated
 * default state (which always has `completed: false`).
 */
export function useOnboardingHydrated(): boolean {
  // Always start false on both server AND client to avoid hydration mismatch.
  // The effect fires only on the client after mount, checking if the store
  // has already hydrated from localStorage.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Already hydrated synchronously? Set immediately.
    if (useOnboardingStore.persist?.hasHydrated()) {
      setHydrated(true);
      return;
    }
    // Otherwise, wait for hydration to finish.
    const unsub = useOnboardingStore.persist?.onFinishHydration(() => setHydrated(true));
    return unsub;
  }, []);

  return hydrated;
}
