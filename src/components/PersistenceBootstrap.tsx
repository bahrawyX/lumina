'use client';

/**
 * PersistenceBootstrap
 *
 * Runs once on mount inside the authenticated app shell. Fetches canonical
 * records from the DB and hydrates the relevant Zustand stores.
 *
 * Rules:
 * - The DB is the ONLY source of truth — stores always start empty.
 * - `hydrateFromDb` is always called (even with an empty array) so `dbHydrated`
 *   flips to true regardless of whether the user has data yet.
 * - Every fetch returns a `FetchResult`, so "the request failed" and "there is
 *   no data" are distinguishable. On failure we call the store's
 *   `hydrateFromDbFailed()` AND record the failure in `useHydrationStatusStore`,
 *   which drives the retry banner in `AppShell`.
 * - Hydrates once per `retryNonce` (guarded by a ref + each store's `dbHydrated`
 *   flag). Bumping the nonce via `useHydrationStatusStore.retry()` re-runs the
 *   whole bootstrap in place, so the retry affordance does not lose UI state.
 * - Runs in parallel — no sequential blocking. No polling, no refetch loops.
 *
 * Historical note: the `hydrate*Failed()` callbacks below were wired up long
 * before this change and could never fire, because every `fetchAll*` swallowed
 * errors and resolved with `[]`. The entire failure-handling API existed, read
 * correctly in review, and did nothing at runtime. It is live now.
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
import { migrateGuestData } from '@/lib/persistence/guestMigration';
import { hasGuestData } from '@/lib/persistence/guestStorage';
import notify from '@/utils/notify';
import { clearLuminaStorage } from '@/lib/storage';
import { adoptBrowserTimeZone } from '@/lib/time/adoptBrowserTimeZone';
import {
  useHydrationStatusStore,
  type HydrationDomain,
} from '@/store/useHydrationStatusStore';
import { apiGetList, dedupedGetJson, type FetchResult } from '@/lib/persistence/apiClient';
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

/**
 * Route one bootstrap fetch to the right store call.
 *
 * On success: hydrate and clear any recorded failure for that domain (so a
 * successful retry removes it from the banner).
 * On failure: flip `dbHydrated` via `onFailure` — which unblocks the shell's
 * loading overlay — and record *why*, so the UI can distinguish "you have no
 * tasks" from "we could not load your tasks".
 */
async function hydrateDomain<T>(
  domain: HydrationDomain,
  fetcher: () => Promise<FetchResult<T>>,
  onSuccess: (data: T) => void,
  onFailure: () => void,
): Promise<void> {
  const { markFailed, markLoaded } = useHydrationStatusStore.getState();
  let result: FetchResult<T>;
  try {
    result = await fetcher();
  } catch {
    // A fetcher should not throw — they all return FetchResult now — but a
    // mapper bug must not take down the other eleven hydrations.
    onFailure();
    markFailed(domain, 'parse');
    return;
  }
  if (result.kind === 'error') {
    onFailure();
    markFailed(domain, result.status);
    return;
  }
  onSuccess(result.data);
  markLoaded(domain);
}

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

  const { data: session, isPending: sessionPending } = authClient.useSession();

  // Signing in clears a stale guest flag — that direction is always correct.
  //
  // The reverse is NOT done here any more. This effect used to call
  // `setGuest(true)` whenever the session resolved with no user, which meant an
  // expired cookie, a cleared cookie, a third-party-cookie block or a transient
  // `/api/auth/get-session` failure all silently made you a "guest". That
  // rerouted every doc write into `localStorage['lumina-guest-docs']` while the
  // UI still looked like a signed-in account, and armed the `beforeunload`
  // guard during what the user believed was an ordinary session.
  //
  // Guest mode is now entered only from the deliberate two-step confirm
  // (`enterGuestMode`). "The session went away" is a different state, handled by
  // `SessionExpiryWatcher` -> `SessionExpiredDialog`.
  useEffect(() => {
    if (sessionPending) return;
    if (!session?.user?.id) return;

    // Gated on the DATA, not on the `isGuest` flag.
    //
    // The flag version never ran. All three sign-in handlers call
    // `clearGuestSession()` *before* `router.replace(destination)`, so by the
    // time this component mounts on the destination route `isGuest` is already
    // false and the effect returned on its first line — on the exact route both
    // upgrade CTAs link to. The modal's promise was still unkept.
    //
    // Clearing the flag early is right (you stop being a guest the moment you
    // sign in, and `clearGuestSession` deliberately KEEPS the local data), so
    // the flag is simply the wrong thing to key on. `hasGuestData()` is true
    // exactly when there is something to import, which also makes this correct
    // on the paths that never set the flag in this tab at all: a guest who
    // signs up from `/onboarding` (which does not mount this component) gets
    // their import on the next authenticated mount instead of never.
    if (!hasGuestData()) return;
    const { clearGuestSession } = useGuestStore.getState();

    // The guest just became a real account. `GuestUpgradeModal` promises their
    // data "can be imported" — before this, nothing imported it and the guest
    // records were orphaned in localStorage until sign-out hard-deleted them.
    void migrateGuestData()
      .then((result) => {
        if (result.migrated > 0) {
          notify(
            result.failed > 0
              ? `Imported ${result.migrated} items. ${result.failed} couldn't be saved and are still on this device.`
              : `Imported ${result.migrated} items from your guest session.`,
          );
        }
      })
      .catch(() => {
        // Never block sign-in on the import. The guest data stays put and the
        // next authenticated mount retries.
      })
      .finally(() => {
        clearGuestSession();
      });
  }, [session?.user?.id, sessionPending]);

  /**
   * F8.3: these three used to be called inside the hydration effect, which runs
   * once on mount — BEFORE `useSession` resolves. `session?.user?.id` was
   * `undefined` every time, so `setUserId` never actually fired for a real
   * user.
   *
   * Harmless while the per-user save functions are no-ops, but a live trap for
   * anyone reinstating user-scoped local caching — which is exactly what the
   * guest-data work needs. Keyed on the id so it fires when the session lands.
   */
  useEffect(() => {
    // `null` on sign-out, not an early return: leaving the departed user's id
    // in the stores is the same stale-identity trap this finding is about, one
    // step further along.
    const userId = session?.user?.id ?? null;
    setEventsUserId(userId);
    setTasksUserId(userId);
    setFocusUserId(userId);
  }, [session?.user?.id, setEventsUserId, setTasksUserId, setFocusUserId]);

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
    // F7.4: this used to sweep localStorage by hand and then reload. Two gaps.
    //
    // It never touched sessionStorage, where the `lumina:` external-event cache
    // lives — so account A's Google/Outlook events survived into account B.
    //
    // And `reload()` does not unload synchronously: the page keeps running
    // until the navigation commits, with every persisted store still hydrated
    // in memory. A `set()` in that window re-wrote its key with account A's
    // data, which then survived the reload. `clearLuminaStorage()` seals
    // Lumina-owned writes after sweeping, so a store writing during teardown
    // can no longer resurrect what was just deleted.
    // `seal: true` because `location.reload()` follows on the next line and
    // this document is finished. The seal is what stops a store flushing
    // during teardown from resurrecting the previous account's data.
    clearLuminaStorage({ seal: true });

    // Written AFTER the sweep and through the raw API — `USER_ID_KEY` is the
    // one Lumina key that must survive it, since it is how the next mount
    // knows whose data is in the browser.
    try {
      localStorage.setItem(USER_ID_KEY, currentId);
    } catch {
      // A failure here costs one redundant wipe on the next load, not
      // correctness.
    }
    window.location.reload();
  }, [session?.user?.id]);

  // Bumped by the retry banner. Re-running the whole bootstrap in place is
  // better than a page reload: it keeps unsaved UI state and open dialogs.
  const retryNonce = useHydrationStatusStore((s) => s.retryNonce);
  const lastRunNonce = useRef(-1);

  useEffect(() => {
    const isRetry = retryNonce !== lastRunNonce.current && lastRunNonce.current !== -1;
    if (hasRun.current && !isRetry) return;
    if (!isRetry && eventsHydrated && tasksHydrated && focusHydrated && plannerHydrated) return;
    hasRun.current = true;
    lastRunNonce.current = retryNonce;

    void Promise.allSettled([
      // User preferences — expands to include timezone, notification prefs,
      // work hours, pomodoro settings, and ambient track
      preferencesHydrated && !isRetry
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
                onboardingCompleted?: boolean;
                userRole?: string;
              }>;
            })
            .then((prefs) => {
              // P2-8: `users.timezone` is the single source of truth for every
              // day boundary the server computes — task bursts, "completed on
              // due date", planner day filters, the streak. It was only ever
              // written when the user opened settings, so for most accounts it
              // sat at UTC and every one of those calculations ran a day out
              // for anyone west of Greenwich.
              //
              // Seed it from the browser on first authenticated load, but ONLY
              // when nothing real is stored yet. Overwriting on every mismatch
              // would fight a user who deliberately picked a zone in settings
              // and then travelled.
              adoptBrowserTimeZone(prefs.timezone);

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

              // F8.1 — adopt the server's onboarding record. Without this, a
              // returning user on a new device, a cleared browser or a private
              // window has `completed: false` locally and is force-marched
              // through the entire flow again, overwriting the work hours and
              // timezone already stored against their account.
              useOnboardingStore.getState().hydrateFromServer({
                onboardingCompleted: prefs.onboardingCompleted === true,
                userRole: prefs.userRole,
                workStart: prefs.workStart,
                workEnd: prefs.workEnd,
                timezone: prefs.timezone,
              });
            })
            .catch(() => {
              // Keep local persisted settings if DB prefs are unavailable.
            }),

      // ── Domain hydration ───────────────────────────────────────
      // Each call flips `dbHydrated` to true whether it succeeded or failed —
      // that unblocks the shell's z-[9999] overlay, which previously hung
      // forever in production when a required fetch failed. The difference is
      // that a failure is now RECORDED, so the shell renders a retry banner
      // instead of presenting an empty workspace as fact.
      eventsHydrated && !isRetry
        ? Promise.resolve()
        : hydrateDomain(
            'events',
            eventsPersistence.fetchAllForCurrentUser,
            (events) => hydrateEvents(events as never),
            hydrateEventsFailed,
          ),

      tasksHydrated && !isRetry
        ? Promise.resolve()
        : hydrateDomain('tasks', tasksPersistence.fetchAllForCurrentUser, hydrateTasks, hydrateTasksFailed),

      focusHydrated && !isRetry
        ? Promise.resolve()
        : hydrateDomain('focus', focusPersistence.fetchAllForCurrentUser, hydrateFocus, hydrateFocusFailed),

      plannerHydrated && !isRetry
        ? Promise.resolve()
        : hydrateDomain(
            'planner',
            plannerPersistence.fetchAllForCurrentUser,
            hydratePlanner,
            hydratePlannerFailed,
          ),

      docsHydrated && !isRetry
        ? Promise.resolve()
        : hydrateDomain('docs', docsPersistence.fetchAll, hydrateDocs, hydrateDocsFailed),

      goalsHydrated && !isRetry
        ? Promise.resolve()
        : hydrateDomain('goals', goalsPersistence.fetchAllForCurrentUser, hydrateGoals, hydrateGoalsFailed),

      coinsHydrated && !isRetry
        ? Promise.resolve()
        : hydrateDomain('coins', coinsPersistence.fetchCoinsData, hydrateCoins, hydrateCoinsFailed),

      achievementsHydrated && !isRetry
        ? Promise.resolve()
        : hydrateDomain(
            'achievements',
            () => apiGetList<unknown>('/api/achievements'),
            (data) => hydrateAchievements(data as never),
            hydrateAchievementsFailed,
          ),

      useStreakStore.getState().hydrateFromAPI().catch(() => {}),

      // Notification preferences live in users.notificationPreferences. The
      // store's init() also re-checks browser permission + push subscription
      // state, so we delegate the whole bring-up here instead of relying on
      // a sibling component to call it.
      useNotificationStore.getState().init().catch(() => {}),

      // Integration connection status (google/microsoft) — sidebar + planner
      // both read these flags. Hydrating here avoids each consumer firing its
      // own status fetch and makes guest-mode handling uniform.
      dedupedGetJson<{
        google?: { connected: boolean };
        microsoft?: { connected: boolean };
      }>('/api/integrations/status')
        .then(async (result) => {
          if (result.kind === 'error') return;
          const data = result.data;
          // Push into onboarding (used by integrations UI) and planner store
          // (used to gate Outlook event fetches).
          useOnboardingStore.getState().setGoogleConnected(Boolean(data.google?.connected));
          useOnboardingStore.getState().setMicrosoftConnected(Boolean(data.microsoft?.connected));
          const planner = (await import('@/store/usePlannerStore')).usePlannerStore.getState();
          planner.setGoogleConnected(Boolean(data.google?.connected));
          planner.setOutlookConnected(Boolean(data.microsoft?.connected));
          if (!data.microsoft?.connected) planner.setOutlookEvents([]);
        })
        .catch(() => {}),
    ]).then((results) => {
      useHydrationStatusStore.getState().retryFinished();
      if (isDev) {
        const rejected = results.filter((r) => r.status === 'rejected');
        if (rejected.length > 0) {
          console.warn('[PersistenceBootstrap] Some hydrations failed:', rejected);
        }
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryNonce]);

  return null;
}
