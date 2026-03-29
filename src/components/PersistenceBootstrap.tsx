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
 * - Does NOT touch useDailyPlanStore (planner domain is deferred)
 */

import { useEffect, useRef } from 'react';
import { useCalendarEventsStore } from '@/store/useCalendarEventsStore';
import { useTaskBoardStore } from '@/store/useTaskBoardStore';
import { useFocusStore } from '@/store/useFocusStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useStreakStore } from '@/store/useStreakStore';
import { authClient } from '@/lib/auth-client';
import * as eventsPersistence from '@/lib/persistence/eventsPersistence';
import * as tasksPersistence from '@/lib/persistence/tasksPersistence';
import * as focusPersistence from '@/lib/persistence/focusPersistence';

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

  const eventsHydrated = useCalendarEventsStore((s) => s.dbHydrated);
  const tasksHydrated = useTaskBoardStore((s) => s.dbHydrated);
  const focusHydrated = useFocusStore((s) => s.dbHydrated);
  const preferencesHydrated = useSettingsStore((s) => s.preferencesHydrated);
  const hydrateFocusSessionLengthFromDb = useSettingsStore((s) => s.hydrateFocusSessionLengthFromDb);

  const { data: session } = authClient.useSession();

  useEffect(() => {
    // Guard against double-run in StrictMode / remounts
    if (hasRun.current) return;
    if (eventsHydrated && tasksHydrated && focusHydrated) return;
    hasRun.current = true;

    // Propagate userId to stores so localStorage writes are namespaced.
    const userId = session?.user?.id ?? null;
    if (userId) {
      setEventsUserId(userId);
      setTasksUserId(userId);
      setFocusUserId(userId);
    }

    // Run all fetches in parallel — no sequential blocking.
    // Always call hydrateFromDb (even with empty array) so dbHydrated becomes
    // true and the stores never fall back to localStorage as a live data source.
    void Promise.all([
      preferencesHydrated
        ? Promise.resolve()
        : fetch('/api/users/preferences')
            .then(async (res) => {
              if (!res.ok) throw new Error(`Preferences fetch failed (${res.status})`);
              return res.json() as Promise<{ focusSessionLength?: number }>;
            })
            .then((prefs) => {
              if (typeof prefs.focusSessionLength === 'number') {
                hydrateFocusSessionLengthFromDb(prefs.focusSessionLength);
              }
            })
            .catch(() => {
              // Keep local persisted settings if DB prefs are unavailable.
            }),

      eventsHydrated
        ? Promise.resolve()
        : eventsPersistence.fetchAllForCurrentUser()
            .then((events) => hydrateEvents(events as any))
            .catch(() => {
              if (isDev) hydrateEventsFailed();
            }),

      tasksHydrated
        ? Promise.resolve()
        : tasksPersistence.fetchAllForCurrentUser()
            .then((tasks) => hydrateTasks(tasks))
            .catch(() => {
              if (isDev) hydrateTasksFailed();
            }),

      focusHydrated
        ? Promise.resolve()
        : focusPersistence.fetchAllForCurrentUser()
            .then((sessions) => hydrateFocus(sessions))
            .catch(() => {
              if (isDev) hydrateFocusFailed();
            }),

      // Hydrate streak store from API
      useStreakStore.getState().hydrateFromAPI().catch(() => {}),
    ]).catch((err) => {
      if (isDev) {
        console.warn('[PersistenceBootstrap] Unexpected hydration error:', err);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
