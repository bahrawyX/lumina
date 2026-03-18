'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useCalendarStore } from '../store/useCalendarStore';
import { usePlannerStore } from '../store/usePlannerStore';
import { useCalendarEventsStore } from '../store/useCalendarEventsStore';
import * as eventsPersistence from '../lib/persistence/eventsPersistence';

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Periodically calls POST /api/sync/outlook to persist Outlook events to the DB,
 * then refreshes the main calendar events store from the DB so they appear in
 * the calendar view alongside Google and local events.
 */
export function useOutlookSync() {
  const timezone = useCalendarStore((s) => s.timezone);
  const outlookConnected = usePlannerStore((s) => s.outlookConnected);
  const setOutlookSyncing = usePlannerStore((s) => s.setOutlookSyncing);
  const setOutlookConnected = usePlannerStore((s) => s.setOutlookConnected);
  const setOutlookEvents = usePlannerStore((s) => s.setOutlookEvents);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runSync = useCallback(async () => {
    setOutlookSyncing(true);
    try {
      const res = await fetch('/api/sync/outlook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone }),
      });

      if (res.status === 401 || res.status === 403 || res.status === 404) {
        // Token expired or integration removed — mark disconnected
        setOutlookConnected(false);
        setOutlookEvents([]);
        return;
      }

      if (!res.ok) {
        console.error('[useOutlookSync] Sync failed:', res.status);
        return;
      }

      // Events are now in the DB. Refresh the main events store so they appear
      // in the calendar alongside Google and local events.
      const freshEvents = await eventsPersistence.fetchAllForCurrentUser();
      useCalendarEventsStore.setState({
        events: freshEvents,
        dbHydrated: true,
      });

      // Clear in-memory Outlook events — they are now served from the DB
      setOutlookEvents([]);
    } catch (err) {
      console.error('[useOutlookSync]', err);
    } finally {
      setOutlookSyncing(false);
    }
  }, [timezone, setOutlookSyncing, setOutlookConnected, setOutlookEvents]);

  useEffect(() => {
    if (!outlookConnected) return;

    runSync();

    intervalRef.current = setInterval(runSync, SYNC_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [outlookConnected, runSync]);

  return { runSync };
}
