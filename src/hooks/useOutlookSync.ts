'use client';

/**
 * useOutlookSync
 *
 * Handles external calendar event fetching for ALL connected providers
 * (Google + Microsoft).  Mounted once in AppShell.tsx.
 *
 * Fetch strategy:
 *  - Range change → fetch immediately (cache decides if network call needed)
 *  - Background poll every 10 min using REFS for view/date (stable interval,
 *    does not restart on navigation)
 *  - cache TTL = 5 min → a poll at 10 min always gets a fresh fetch
 *
 * Failure safety:
 *  - Full HTTP failure → toast warning, existing store events preserved
 *  - Per-provider API error → toast warning for that provider only, other
 *    provider's events still updated, stale events preserved
 *  - Local calendar is NEVER affected by external fetch failures
 */

import { useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { useCalendarStore } from '../store/useCalendarStore';
import { usePlannerStore } from '../store/usePlannerStore';
import { authClient } from '../lib/auth-client';
import { ViewType } from '../types';
import type { CalendarEvent, EventProvider } from '../types';
import { getCached, setCache } from '../lib/calendar/externalEventsCache';
import type { ApiExternalEvent } from '../lib/calendar/externalEventTypes';

// Background poll interval — longer than cache TTL so the cache is always
// stale when the poll fires, guaranteeing a refresh without needing force=true.
const POLL_INTERVAL_MS = 10 * 60 * 1_000; // 10 minutes  (cache TTL = 5 min)
const FOCUS_SYNC_MIN_INTERVAL_MS = 30 * 1000;

export function triggerExternalSync(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('lumina:external-sync-now'));
}

// ── Date range helpers ─────────────────────────────────────────────────────

function computeRange(view: ViewType, currentDate: Date): { start: string; end: string } {
  const d = new Date(currentDate);
  let startMs: number, endMs: number;

  if (view === ViewType.MONTH) {
    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
    const monthEnd   = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    startMs = monthStart.getTime() - 7 * 86_400_000;
    endMs   = monthEnd.getTime()   + 7 * 86_400_000;
  } else if (view === ViewType.WEEK) {
    const dow = d.getDay();
    const weekStart = new Date(d); weekStart.setDate(d.getDate() - dow);
    const weekEnd   = new Date(d); weekEnd.setDate(d.getDate() + (6 - dow));
    startMs = weekStart.getTime() - 2 * 86_400_000;
    endMs   = weekEnd.getTime()   + 2 * 86_400_000;
  } else {
    startMs = d.getTime() - 86_400_000;
    endMs   = d.getTime() + 2 * 86_400_000;
  }

  return {
    start: new Date(startMs).toISOString(),
    end:   new Date(endMs).toISOString(),
  };
}

// ── Normalization: ApiExternalEvent → CalendarEvent ────────────────────────

function fmt2(n: number): string { return String(n).padStart(2, '0'); }

function apiToCalendarEvent(e: ApiExternalEvent): CalendarEvent {
  if (e.isAllDay) {
    return {
      id:          `${e.provider}:${e.externalEventId}`,
      title:       e.title,
      description: e.description ?? '',
      date:        e.startIso.slice(0, 10),
      startTime:   '00:00',
      endTime:     '23:59',
      timezone:    e.timezone,
      location:    e.location || undefined,
      category:    'Work',
      color:       e.color,
      source:      e.provider,
      provider:    e.provider as EventProvider,
      editable:    false,
      readOnly:    true,
      draggable:   false,
      organizer:   e.organizerEmail || undefined,
    };
  }

  // Timed event — format in the browser's local timezone for display
  const start = new Date(e.startIso);
  const end   = new Date(e.endIso);

  return {
    id:          `${e.provider}:${e.externalEventId}`,
    title:       e.title,
    description: e.description ?? '',
    date:        `${start.getFullYear()}-${fmt2(start.getMonth() + 1)}-${fmt2(start.getDate())}`,
    startTime:   `${fmt2(start.getHours())}:${fmt2(start.getMinutes())}`,
    endTime:     `${fmt2(end.getHours())}:${fmt2(end.getMinutes())}`,
    timezone:    e.timezone,
    location:    e.location || undefined,
    category:    'Work',
    color:       e.color,
    source:      e.provider,
    provider:    e.provider as EventProvider,
    editable:    false,
    readOnly:    true,
    draggable:   false,
    organizer:   e.organizerEmail || undefined,
  };
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useOutlookSync() {
  const view        = useCalendarStore((s) => s.view);
  const currentDate = useCalendarStore((s) => s.currentDate);
  const setGoogleEvents  = usePlannerStore((s) => s.setGoogleEvents);
  const setOutlookEvents = usePlannerStore((s) => s.setOutlookEvents);
  const setIsSyncing = usePlannerStore((s) => s.setIsSyncing);
  const setLastSyncedAt = usePlannerStore((s) => s.setLastSyncedAt);
  const setSyncError = usePlannerStore((s) => s.setSyncError);

  const { data: session } = authClient.useSession();
  const userId = session?.user?.id ?? null;

  // Refs for the stable background poll — updated synchronously each render
  // so the interval always reads the current view/date without being a dep.
  const viewRef        = useRef(view);
  const dateRef        = useRef(currentDate);
  const isFetchingRef  = useRef(false);
  const lastFocusSyncAtRef = useRef(0);
  viewRef.current  = view;
  dateRef.current  = currentDate;

  const syncRange = useCallback(
    async (range: { start: string; end: string }, options?: { showLoader?: boolean; force?: boolean }) => {
      if (!userId) return;
      if (isFetchingRef.current) return;
      const showLoader = options?.showLoader === true;
      const force = options?.force === true;
      const loaderToastId = 'calendar-sync-loading';

      const startKey = range.start.slice(0, 10);
      const endKey   = range.end.slice(0, 10);

      const cachedGoogle = force
        ? null
        : getCached(userId, 'google', startKey, endKey);
      const cachedMs = force
        ? null
        : getCached(userId, 'microsoft', startKey, endKey);
      const cachedMsWithEvents = cachedMs && cachedMs.length > 0 ? cachedMs : null;

      isFetchingRef.current = true;
      setIsSyncing(true);
      setSyncError(null);
      if (showLoader) {
        toast.loading('Syncing calendars...', { id: loaderToastId });
      }
      let syncFailed = false;
      const providerErrors: string[] = [];
      try {
        let googleConnected = true;
        let outlookConnected = true;

        const statusRes = await fetch('/api/integrations/status', { cache: 'no-store' });
        if (statusRes.status === 401) return;
        if (statusRes.ok) {
          const statusData = await statusRes.json() as {
            google?: { connected?: boolean };
            microsoft?: { connected?: boolean };
          };
          googleConnected = Boolean(statusData.google?.connected);
          outlookConnected = Boolean(statusData.microsoft?.connected);
        }

        if (!googleConnected && !outlookConnected) return;

        if (googleConnected) {
          if (cachedGoogle !== null) {
            setGoogleEvents(cachedGoogle);
          } else {
            const googleUrl = new URL('/api/external-events/google', window.location.origin);
            googleUrl.searchParams.set('start', range.start);
            googleUrl.searchParams.set('end', range.end);

            const googleRes = await fetch(googleUrl.toString());

            if (googleRes.status === 401) return;
            if (googleRes.status === 403) {
              setGoogleEvents([]);
              providerErrors.push('Google authorization required.');
            } else if (!googleRes.ok) {
              toast.warning('Google Calendar could not refresh. Showing cached events.', {
                id: 'google-sync-warn',
                duration: 6_000,
              });
              providerErrors.push(`Google sync failed (${googleRes.status}).`);
            } else {
              const googleData = await googleRes.json() as { events?: ApiExternalEvent[] };
              const googleRaw = googleData.events ?? [];
              const mappedGoogle = googleRaw.map(apiToCalendarEvent);
              setCache(userId, 'google', startKey, endKey, mappedGoogle);
              setGoogleEvents(mappedGoogle);
            }
          }
        }

        if (outlookConnected) {
          if (cachedMsWithEvents !== null) {
            setOutlookEvents(cachedMsWithEvents);
          } else {
            const msUrl = new URL('/api/external-events/microsoft', window.location.origin);
            msUrl.searchParams.set('start', range.start);
            msUrl.searchParams.set('end', range.end);

            const msRes = await fetch(msUrl.toString());

            if (msRes.status === 401) return;
            if (msRes.status === 403) {
              setOutlookEvents([]);
              providerErrors.push('Outlook authorization required.');
            } else if (!msRes.ok) {
              toast.warning('Outlook could not refresh. Showing cached events.', {
                id: 'ms-sync-warn',
                duration: 6_000,
              });
              providerErrors.push(`Outlook sync failed (${msRes.status}).`);
            } else {
              const msData = await msRes.json() as { events?: ApiExternalEvent[] };
              const msRaw = msData.events ?? [];
              const events = msRaw.map(apiToCalendarEvent);
              setCache(userId, 'microsoft', startKey, endKey, events);
              setOutlookEvents(events);
            }
          }
        }

        if (providerErrors.length > 0) {
          setSyncError(providerErrors[0]);
        } else {
          setLastSyncedAt(new Date().toISOString());
          setSyncError(null);
        }
      } catch (err) {
        syncFailed = true;
        const message = err instanceof Error ? err.message : 'External sync failed.';
        setSyncError(message);
        // Unexpected error (network offline, etc.) — preserve store, warn once
        console.error('[useOutlookSync]', err);
        toast.warning('External calendar could not connect. Check your connection.', {
          id: 'external-events-error',
          duration: 6_000,
        });
        if (showLoader) {
          toast.error('Calendar sync failed.', { id: loaderToastId, duration: 4_000 });
        }
      } finally {
        if (showLoader && !syncFailed) {
          toast.success('Calendars synced.', { id: loaderToastId, duration: 2_000 });
        }
        isFetchingRef.current = false;
        setIsSyncing(false);
      }
    },
    [
      userId,
      setGoogleEvents,
      setOutlookEvents,
      setIsSyncing,
      setLastSyncedAt,
      setSyncError,
    ],
  );

  // ── Effect 1: Re-fetch when visible range changes ────────────────────────
  // `syncRange` checks the cache first — no network call if data is fresh.
  useEffect(() => {
    if (!userId) return;
    syncRange(computeRange(view, currentDate), { showLoader: false });
  }, [userId, view, currentDate, syncRange]);

  useEffect(() => {
    if (!userId) return;

    const onSyncNow = () => {
      void syncRange(computeRange(viewRef.current, dateRef.current), { showLoader: true, force: true });
    };

    window.addEventListener('lumina:external-sync-now', onSyncNow);
    return () => {
      window.removeEventListener('lumina:external-sync-now', onSyncNow);
    };
  }, [userId, syncRange]);

  // ── Effect 2: Stable background poll ─────────────────────────────────────
  // Only depends on userId + syncRange — does NOT restart on every navigation.
  // Reads current view/date from refs at the time each tick fires.
  useEffect(() => {
    if (!userId) return;

    const id = setInterval(() => {
      syncRange(computeRange(viewRef.current, dateRef.current), { showLoader: false });
    }, POLL_INTERVAL_MS);

    return () => clearInterval(id);
  }, [userId, syncRange]);

  useEffect(() => {
    if (!userId) return;

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;

      const now = Date.now();
      if (now - lastFocusSyncAtRef.current < FOCUS_SYNC_MIN_INTERVAL_MS) return;
      lastFocusSyncAtRef.current = now;

      void syncRange(computeRange(viewRef.current, dateRef.current), { showLoader: false });
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [userId, syncRange]);

  return null;
}
