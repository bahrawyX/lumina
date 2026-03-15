'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useCalendarStore } from '../store/useCalendarStore';
import { usePlannerStore } from '../store/usePlannerStore';
import { syncOutlookCalendar } from '../services/outlookSyncService';
import { isOutlookConnected } from '../lib/outlook/outlookAuth';

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function useOutlookSync() {
  const timezone = useCalendarStore((s) => s.timezone);
  const outlookConnected = usePlannerStore((s) => s.outlookConnected);
  const setOutlookEvents = usePlannerStore((s) => s.setOutlookEvents);
  const setOutlookSyncing = usePlannerStore((s) => s.setOutlookSyncing);
  const setOutlookConnected = usePlannerStore((s) => s.setOutlookConnected);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runSync = useCallback(async () => {
    if (!isOutlookConnected()) {
      setOutlookConnected(false);
      return;
    }
    setOutlookSyncing(true);
    try {
      const events = await syncOutlookCalendar(timezone);
      setOutlookEvents(events);
    } catch (err) {
      console.error('[useOutlookSync]', err);
    } finally {
      setOutlookSyncing(false);
    }
  }, [timezone, setOutlookEvents, setOutlookSyncing, setOutlookConnected]);

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
