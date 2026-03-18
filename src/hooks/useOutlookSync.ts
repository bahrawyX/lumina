'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useCalendarStore } from '../store/useCalendarStore';
import { usePlannerStore } from '../store/usePlannerStore';
import { mapOutlookEventToLuminaEvent } from '../lib/outlook/outlookEvents';

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function useOutlookSync() {
  const timezone = useCalendarStore((s) => s.timezone);
  const outlookConnected = usePlannerStore((s) => s.outlookConnected);
  const setOutlookEvents = usePlannerStore((s) => s.setOutlookEvents);
  const setOutlookSyncing = usePlannerStore((s) => s.setOutlookSyncing);
  const setOutlookConnected = usePlannerStore((s) => s.setOutlookConnected);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runSync = useCallback(async () => {
    setOutlookSyncing(true);
    try {
      const res = await fetch('/api/sync/outlook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone }),
      });

      if (res.status === 401 || res.status === 404) {
        // Token expired or integration not found — mark disconnected
        setOutlookConnected(false);
        setOutlookEvents([]);
        return;
      }

      if (!res.ok) {
        console.error('[useOutlookSync] Sync failed:', res.status);
        return;
      }

      const data = (await res.json()) as { events?: unknown[] };
      const rawEvents = Array.isArray(data.events) ? data.events : [];

      // Map Microsoft Graph events to Lumina's CalendarEvent shape
      const mapped = rawEvents
        .map((e) => {
          try {
            return mapOutlookEventToLuminaEvent(
              e as Parameters<typeof mapOutlookEventToLuminaEvent>[0],
              timezone,
            );
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      setOutlookEvents(mapped as ReturnType<typeof mapOutlookEventToLuminaEvent>[]);
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
