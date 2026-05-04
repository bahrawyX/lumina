'use client';

/**
 * PersistenceBootstrap
 *
 * Runs once on mount inside the authenticated app shell.
 * Fetches canonical records from the DB and hydrates the relevant Zustand
 * stores.
 *
 * Safe-mode rules:
 * - DB is the ONLY source of truth — stores always start empty.
 * - hydrateFromDb is always called (even with empty array) so dbHydrated
 *   is set to true regardless of whether the user has data yet.
 * - On fetch failure in development only, hydrateFromDbFailed is called
 *   as a fallback to localStorage (namespaced by userId).
 * - localStorage writes remain active for debugging; reads are disabled
 *   except as the dev fallback path above.
 *
 * Other rules enforced:
 * - Hydrates only once (guarded by useRef + store.dbHydrated flag)
 * - Runs in parallel — no sequential blocking
 * - No polling, no refetch loops, no hot-path interference
 */

import { useEffect, useRef } from 'react';
import { useCalendarEventsStore } from '@/store/useCalendarEventsStore';
import { useCalendarStore } from '@/store/useCalendarStore';
import { useTaskBoardStore } from '@/store/useTaskBoardStore';
import { useFocusStore } from '@/store/useFocusStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useDailyPlanStore } from '@/store/useDailyPlanStore';
import { useStreakStore } from '@/store/useStreakStore';
import { useDocsStore } from '@/store/useDocsStore';
import { useGoalsStore } from '@/store/useGoalsStore';
import { useCoinsStore } from '@/store/useCoinsStore';
import { useAchievementsStore } from '@/store/useAchievementsStore';
import { useAmbientStore } from '@/store/useAmbientStore';
import { useNotificationStore } from '@/store/useNotificationStore';
import { useOnboardingStore } from '@/store/useOnboardingStore';
import { usePomodoroStore } from '@/store/usePomodoroStore';
import { authClient } from '@/lib/auth-client';
import { useGuestStore } from '@/store/useGuestStore';
import * as eventsPersistence from '@/lib/persistence/eventsPersistence';
import * as tasksPersistence from '@/lib/persistence/tasksPersistence';
import * as focusPersistence from '@/lib/persistence/focusPersistence';
import * as plannerPersistence from '@/lib/persistence/plannerPersistence';
import * as docsPersistence from '@/lib/persistence/docsPersistence';
import * as goalsPersistence from '@/lib/persistence/goalsPersistence';
import * as coinsPersistence from '@/lib/persistence/coinsPersistence';

// migrateMany stubs — imported to satisfy any callers referencing them
export { migrateMany as migrateEventsMany } from '@/lib/persistence/eventsPersistence';
export { migrateMany as migrateTasksMany } from '@/lib/persistence/tasksPersistence';
export { migrateMany as migratePlannerMany } from '@/lib/persistence/plannerPersistence';
export { migrateMany as migrateFocusMany } from '@/lib/persistence/focusPersistence';

const isDev = process.env.NODE_ENV === 'development';

export default function PersistenceBootstrap() {
  const hasRun = useRef(false);

  const hydrateEvents = useCalendarEventsStore((s) => s.hydrateFromDb);
  const hydrateEventsFailed = useCalendarEventsStore((s) => s.hydrateFromDbFailed);
  const setEventsUserId = useCalendarEventsStore((s) => s.setUserId);

  const hydrateTasks = useTaskBoardStore((s) => s.hydrateFromDb);
  const hydrateTasksFailed = useTaskBoardStore((s) => s.hydrateFromDbFailed);
  const setTasksUserId = useTaskBoardStore((s) => s.setUserId);

  const hydrateFocus = useFocusStore((s) => s.hydrateFromDb);
  const hydrateFocusFailed = useFocusStore((s) => s.hydrateFromDbFailed);
  const setFocusUserId = useFocusStore((s) => s.setUserId);

  const hydratePlanner = useDailyPlanStore((s) => s.hydrateFromDb);
  const hydratePlannerFailed = useDailyPlanStore((s) => s.hydrateFromDbFailed);
  const plannerHydrated = useDailyPlanStore((s) => s.dbHydrated);

  const hydrateDocs = useDocsStore((s) => s.hydrateFromDb);
  const hydrateDocsFailed = useDocsStore((s) => s.hydrateFromDbFailed);
  const docsHydrated = useDocsStore((s) => s.dbHydrated);

  const hydrateGoals = useGoalsStore((s) => s.hydrateFromDb);
  const hydrateGoalsFailed = useGoalsStore((s) => s.hydrateFromDbFailed);
  const goalsHydrated = useGoalsStore((s) => s.dbHydrated);

  const hydrateCoins = useCoinsStore((s) => s.hydrateFromDb);
  const hydrateCoinsFailed = useCoinsStore((s) => s.hydrateFromDbFailed);
  const coinsHydrated = useCoinsStore((s) => s.dbHydrated);

  const hydrateAchievements = useAchievementsStore((s) => s.hydrateFromDb);
  const hydrateAchievementsFailed = useAchievementsStore((s) => s.hydrateFromDbFailed);
  const achievementsHydrated = useAchievementsStore((s) => s.dbHydrated);

  const eventsHydrated = useCalendarEventsStore((s) => s.dbHydrated);
  const tasksHydrated = useTaskBoardStore((s) => s.dbHydrated);
  const focusHydrated = useFocusStore((s) => s.dbHydrated);
  const preferencesHydrated = useSettingsStore((s) => s.preferencesHydrated);
  const hydratePreferencesFromDb = useSettingsStore((s) => s.hydratePreferencesFromDb);

  const { data: session } = authClient.useSession();

  // Clear stale guest flag when a real session is present.
  useEffect(() => {
    if (session?.user?.id && useGuestStore.getState().isGuest) {
      useGuestStore.getState().clearGuestSession();
    }
  }, [session?.user?.id]);

  // Sync the auth user's real name + email into the calendar profile so the
  // sidebar footer and Profile page show the DB name, not the hardcoded default.
  useEffect(() => {
    const u = session?.user;
    if (!u) return;
    const patch: Record<string, string> = {};
    if (u.name)  patch.name  = u.name;
    if (u.email) patch.email = u.email;
    if (Object.keys(patch).length > 0) {
      useCalendarStore.getState().updateProfile(patch);
    }
  }, [session?.user?.id]);

  // Cross-user data-isolation guard.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const currentId = session?.user?.id;
    if (!currentId) return;

    const USER_ID_KEY = 'lumina-user-id';
    const storedId = localStorage.getItem(USER_ID_KEY);

    if (!storedId) {
      localStorage.setItem(USER_ID_KEY, currentId);
      return;
    }

    if (storedId === currentId) return;

    // Clear BOTH naming conventions used across the codebase:
    //   lumina-*  (Zustand persist names: lumina-streaks, lumina-onboarding, etc.)
    //   lumina_*  (legacy localStorage keys: lumina_pomodoro_state, lumina_profile,
    //             lumina_custom_categories, lumina_focus_sessions, lumina_timer_*, ...)
    // Failing to clear the underscore variants leaks Pomodoro state, custom
    // contexts, focus history, and the calendar profile across user switches.
    const keysToClear: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (
        key &&
        key !== USER_ID_KEY &&
        (key.startsWith('lumina-') || key.startsWith('lumina_'))
      ) {
        keysToClear.push(key);
      }
    }
    keysToClear.forEach((key) => {
      try { localStorage.removeItem(key); } catch { /* ignore */ }
    });
    localStorage.setItem(USER_ID_KEY, currentId);
    window.location.reload();
  }, [session?.user?.id]);

  useEffect(() => {
    if (hasRun.current) return;
    if (eventsHydrated && tasksHydrated && focusHydrated && plannerHydrated) return;
    hasRun.current = true;

    const userId = session?.user?.id ?? null;
    if (userId) {
      setEventsUserId(userId);
      setTasksUserId(userId);
      setFocusUserId(userId);
    }

    void Promise.allSettled([
      // User preferences — expands to include timezone, notification prefs,
      // work hours, pomodoro settings, and ambient track
      preferencesHydrated
        ? Promise.resolve()
        : fetch('/api/users/preferences')
            .then(async (res) => {
              if (!res.ok) throw new Error(`Preferences fetch failed (${res.status})`);
              return res.json() as Promise<{
                focusSessionLength?: number;
                timezone?: string;
                notificationPreferences?: Record<string, boolean>;
                workStart?: string;
                workEnd?: string;
                shortBreakMins?: number;
                longBreakMins?: number;
                sessionsPerCycle?: number;
                ambientTrack?: string | null;
                customCategories?: Array<{ name: string; color: string }>;
              }>;
            })
            .then((prefs) => {
              hydratePreferencesFromDb({
                focusSessionLength: prefs.focusSessionLength,
                timezone: prefs.timezone,
                notificationPreferences: prefs.notificationPreferences as Parameters<typeof hydratePreferencesFromDb>[0]['notificationPreferences'],
                workStart: prefs.workStart,
                workEnd: prefs.workEnd,
              });
              if (Array.isArray(prefs.customCategories)) {
                useCalendarStore.getState().hydrateCustomCategoriesFromDb(prefs.customCategories);
              }
              // Hydrate pomodoro break settings from DB — including workMins so
              // the pomodoro store has a canonical value without relying on the
              // side-channel sync via settingsStore.focusSessionLength.
              if (
                typeof prefs.shortBreakMins === 'number' &&
                typeof prefs.longBreakMins === 'number' &&
                typeof prefs.sessionsPerCycle === 'number'
              ) {
                usePomodoroStore.getState().hydrateFromDb(
                  prefs.shortBreakMins,
                  prefs.longBreakMins,
                  prefs.sessionsPerCycle,
                  typeof prefs.focusSessionLength === 'number' ? prefs.focusSessionLength : undefined,
                );
              }
              // Hydrate ambient track from DB (only fills in if localStorage has nothing)
              useAmbientStore.getState().hydrateTrackFromDb(prefs.ambientTrack ?? null);
            })
            .catch(() => {
              // Keep local persisted settings if DB prefs are unavailable.
            }),

      // ── Hydration catches: ALWAYS flip dbHydrated to true on failure ──
      // The previous `if (isDev)` guards left the global hydration overlay
      // (AppShell.tsx z-[9999] flex items-center justify-center bg-background)
      // stuck forever in production whenever any of the three required fetches
      // (events, tasks, focus) failed silently — the user couldn't even see
      // the page underneath. dbHydrated reaching `true` after a failed fetch
      // is correct: it means "we tried, it didn't work, render with empty
      // state instead of blocking forever".
      eventsHydrated
        ? Promise.resolve()
        : eventsPersistence.fetchAllForCurrentUser()
            .then((events) => hydrateEvents(events as any))
            .catch(() => hydrateEventsFailed()),

      tasksHydrated
        ? Promise.resolve()
        : tasksPersistence.fetchAllForCurrentUser()
            .then((tasks) => hydrateTasks(tasks))
            .catch(() => hydrateTasksFailed()),

      focusHydrated
        ? Promise.resolve()
        : focusPersistence.fetchAllForCurrentUser()
            .then((sessions) => hydrateFocus(sessions))
            .catch(() => hydrateFocusFailed()),

      plannerHydrated
        ? Promise.resolve()
        : plannerPersistence.fetchAllForCurrentUser()
            .then((items) => hydratePlanner(items))
            .catch(() => {
              hydratePlannerFailed();
            }),

      docsHydrated
        ? Promise.resolve()
        : docsPersistence.fetchAll()
            .then((docs) => hydrateDocs(docs))
            .catch(() => hydrateDocsFailed()),

      goalsHydrated
        ? Promise.resolve()
        : goalsPersistence.fetchAllForCurrentUser()
            .then((goals) => hydrateGoals(goals))
            .catch(() => hydrateGoalsFailed()),

      coinsHydrated
        ? Promise.resolve()
        : coinsPersistence.fetchCoinsData()
            .then((data) => hydrateCoins(data))
            .catch(() => hydrateCoinsFailed()),

      achievementsHydrated
        ? Promise.resolve()
        : fetch('/api/achievements')
            .then(async (res) => {
              if (!res.ok) throw new Error(`Achievements fetch failed (${res.status})`);
              return res.json();
            })
            .then((data) => hydrateAchievements(Array.isArray(data) ? data : []))
            .catch(() => hydrateAchievementsFailed()),

      useStreakStore.getState().hydrateFromAPI().catch(() => {}),

      // Notification preferences live in users.notificationPreferences. The
      // store's init() also re-checks browser permission + push subscription
      // state, so we delegate the whole bring-up here instead of relying on
      // a sibling component to call it.
      useNotificationStore.getState().init().catch(() => {}),

      // Integration connection status (google/microsoft) — sidebar + planner
      // both read these flags. Hydrating here avoids each consumer firing its
      // own status fetch and makes guest-mode handling uniform.
      fetch('/api/integrations/status', { cache: 'no-store' })
        .then(async (res) => {
          if (!res.ok) return;
          const data = (await res.json()) as {
            google?: { connected: boolean };
            microsoft?: { connected: boolean };
          };
          // Push into onboarding (used by integrations UI) and planner store
          // (used to gate Outlook event fetches).
          useOnboardingStore.getState().setGoogleConnected(Boolean(data.google?.connected));
          useOnboardingStore.getState().setMicrosoftConnected(Boolean(data.microsoft?.connected));
          const planner = (await import('@/store/usePlannerStore')).usePlannerStore.getState();
          planner.setOutlookConnected(Boolean(data.microsoft?.connected));
          if (!data.microsoft?.connected) planner.setOutlookEvents([]);
        })
        .catch(() => {}),
    ]).then((results) => {
      if (isDev) {
        const rejected = results.filter((r) => r.status === 'rejected');
        if (rejected.length > 0) {
          console.warn('[PersistenceBootstrap] Some hydrations failed:', rejected);
        }
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
