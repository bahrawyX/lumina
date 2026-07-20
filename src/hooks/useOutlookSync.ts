'use client';

/**
 * useOutlookSync
 *
 * Handles external calendar event fetching for ALL connected providers
 * (Google + Microsoft).  Mounted once in AppShell.tsx.
 *
 * Fetch strategy:
 *  - Range change → fetch immediately (cache decides if network call needed)
 *  - Background poll every 10 min using a REF for the date (stable interval,
 *    does not restart on navigation)
 *  - cache TTL = 5 min → a poll at 10 min always gets a fresh fetch
 *
 * Failure safety:
 *  - Full HTTP failure → toast warning, existing store events preserved
 *  - Per-provider API error → toast warning for that provider only, other
 *    provider's events still updated, stale events preserved
 *  - Local calendar is NEVER affected by external fetch failures
 */

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { useCalendarStore } from '../store/useCalendarStore';
import { usePlannerStore } from '../store/usePlannerStore';
import { authClient } from '../lib/auth-client';
import type { CalendarEvent, EventCategory, EventProvider } from '../types';
import { getCached, setCache } from '../lib/calendar/externalEventsCache';
import { createSingleFlight } from '../lib/calendar/singleFlight';
import type { ApiExternalEvent } from '../lib/calendar/externalEventTypes';

// Background poll interval — longer than cache TTL so the cache is always
// stale when the poll fires, guaranteeing a refresh without needing force=true.
const POLL_INTERVAL_MS = 10 * 60 * 1_000; // 10 minutes  (cache TTL = 5 min)
const FOCUS_SYNC_MIN_INTERVAL_MS = 30 * 1000;

// ── Context demo events ────────────────────────────────────────────────────

/**
 * Create one demo event for each built-in context so the calendar has visible
 * content before the user adds their own events.  Stored session-only in
 * usePlannerStore.demoLocalEvents — never written to the DB.
 */
function createContextDemoEvents(): CalendarEvent[] {
  const today = new Date();
  const dayOffset = (n: number): string => {
    const d = new Date(today);
    d.setDate(today.getDate() + n);
    return d.toISOString().split('T')[0];
  };

  const contexts: Array<{
    name: string;
    color: string;
    category: EventCategory;
    days: number;
    start: string;
    end: string;
  }> = [
    { name: 'Critical',  color: '#EF4444', category: 'Critical',  days: -1, start: '08:00', end: '09:00' },
    { name: 'Focus',     color: '#6D59E0', category: 'Focus',     days:  0, start: '10:00', end: '11:30' },
    { name: 'Work',      color: '#475569', category: 'Work',      days:  1, start: '14:00', end: '15:00' },
    { name: 'Social',    color: '#F59E0B', category: 'Social',    days:  2, start: '18:00', end: '19:30' },
    { name: 'Personal',  color: '#10B981', category: 'Personal',  days:  3, start: '07:30', end: '08:15' },
    { name: 'Health',    color: '#EC4899', category: 'Health',    days:  4, start: '06:30', end: '07:30' },
  ];

  return contexts.map((ctx) => ({
    id: `demo_ctx_${ctx.name.toLowerCase()}_001`,
    title: `${ctx.name} — demo event`,
    description: `Example ${ctx.name} event. Create your own to get started.`,
    date: dayOffset(ctx.days),
    startTime: ctx.start,
    endTime: ctx.end,
    category: ctx.category,
    color: ctx.color,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    readOnly: true,
    draggable: false,
  }));
}

export function triggerExternalSync(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('lumina:external-sync-now'));
}

// ── Date range helpers ─────────────────────────────────────────────────────

function computeRange(currentDate: Date): { start: string; end: string } {
  // Always fetch a whole-calendar-month window (± a 7-day pad for the grid's
  // leading/trailing days), REGARDLESS of view. This keeps the window/cache key
  // stable per calendar month, so switching Month/Week/Day — or navigating
  // day-by-day within a month — reuses ONE window instead of fragmenting the
  // 6-window budget (a day view would otherwise mint a fresh ~4-day window on
  // every navigation, churning the whole cache in under a week). The client
  // filters this flat event list down to the actual visible range when rendering.
  const d = new Date(currentDate);
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
  const monthEnd   = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return {
    start: new Date(monthStart.getTime() - 7 * 86_400_000).toISOString(),
    end:   new Date(monthEnd.getTime()   + 7 * 86_400_000).toISOString(),
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
  const currentDate = useCalendarStore((s) => s.currentDate);
  const setGoogleEvents    = usePlannerStore((s) => s.setGoogleEvents);
  const setOutlookEvents   = usePlannerStore((s) => s.setOutlookEvents);
  const mergeGoogleEvents  = usePlannerStore((s) => s.mergeGoogleEvents);
  const mergeOutlookEvents = usePlannerStore((s) => s.mergeOutlookEvents);
  const setDemoLocalEvents = usePlannerStore((s) => s.setDemoLocalEvents);
  const setIsSyncing    = usePlannerStore((s) => s.setIsSyncing);
  const setLastSyncedAt = usePlannerStore((s) => s.setLastSyncedAt);
  const setSyncError    = usePlannerStore((s) => s.setSyncError);
  // Reactive connection flags — a false→true flip (a provider was just
  // connected) deterministically drives a refresh below, instead of relying on
  // the droppable `lumina:external-sync-now` window event.
  const googleConnected  = usePlannerStore((s) => s.googleConnected);
  const outlookConnected = usePlannerStore((s) => s.outlookConnected);

  // Seed context demo events on first mount — visible immediately, no DB/timing dependency.
  useEffect(() => {
    setDemoLocalEvents(createContextDemoEvents());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: session } = authClient.useSession();
  const userId = session?.user?.id ?? null;

  // Ref for the stable background poll — updated synchronously each render so
  // the interval always reads the current date without being a dep.
  const dateRef        = useRef(currentDate);
  const lastFocusSyncAtRef = useRef(0);
  dateRef.current  = currentDate;

  const syncRange = useCallback(
    async (range: { start: string; end: string }, options?: { showLoader?: boolean; force?: boolean }) => {
      if (!userId) return;
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

      setSyncError(null);
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

        // Now we know which providers are active — show a specific toast label
        if (showLoader) {
          const providerLabel =
            googleConnected && outlookConnected
              ? 'Google & Outlook Calendars'
              : googleConnected
              ? 'Google Calendar'
              : 'Outlook Calendar';
          toast.loading(`Syncing ${providerLabel}…`, { id: loaderToastId });
        }

        if (googleConnected) {
          if (cachedGoogle !== null) {
            mergeGoogleEvents(cachedGoogle, startKey, endKey);
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
              mergeGoogleEvents(mappedGoogle, startKey, endKey);
            }
          }
        }

        if (outlookConnected) {
          if (cachedMsWithEvents !== null) {
            mergeOutlookEvents(cachedMsWithEvents, startKey, endKey);
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
              mergeOutlookEvents(events, startKey, endKey);
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
          toast.success('Calendar synced ✓', { id: loaderToastId, duration: 2_000 });
        }
      }
    },
    [
      userId,
      setGoogleEvents,
      setOutlookEvents,
      mergeGoogleEvents,
      mergeOutlookEvents,
      setLastSyncedAt,
      setSyncError,
    ],
  );

  // Single-flight wrapper: coalesces overlapping triggers into at most one
  // queued re-run (no silent drops, no loops) and drives the store `isSyncing`
  // flag that powers the calendar's loading state.
  const runSync = useMemo(
    () =>
      createSingleFlight(
        (range: { start: string; end: string }, options?: { showLoader?: boolean; force?: boolean }) =>
          syncRange(range, options),
        { onBusyChange: setIsSyncing },
      ),
    [syncRange, setIsSyncing],
  );

  // ── Effect 1: Re-fetch when visible range changes ────────────────────────
  // `syncRange` checks the cache first — no network call if data is fresh.
  useEffect(() => {
    if (!userId) return;
    runSync(computeRange(currentDate), { showLoader: false });
  }, [userId, currentDate, runSync]);

  // ── Effect: force a refresh when a provider is newly connected ───────────
  // This is the real fix for "events don't appear until reload". It replaces
  // reliance on the fire-and-forget `lumina:external-sync-now` event (which the
  // in-flight guard could silently drop when it collided with the popup-close
  // visibility sync). A false→true flip of either connection flag is React
  // state and cannot be lost. We baseline the first observation (which may be a
  // persisted / app-load value) and only act on a genuine later connect;
  // ordinary app-load fetching is still handled by Effect 1.
  const prevConnectedRef = useRef<{ google: boolean; outlook: boolean } | null>(null);
  useEffect(() => {
    if (!userId) return;
    const prev = prevConnectedRef.current;
    prevConnectedRef.current = { google: googleConnected, outlook: outlookConnected };
    if (prev === null) return; // first observation → baseline only
    const newlyConnected =
      (googleConnected && !prev.google) || (outlookConnected && !prev.outlook);
    if (newlyConnected) {
      runSync(computeRange(dateRef.current), { showLoader: false, force: true });
    }
  }, [userId, googleConnected, outlookConnected, runSync]);

  useEffect(() => {
    if (!userId) return;

    const onSyncNow = () => {
      runSync(computeRange(dateRef.current), { showLoader: true, force: true });
    };

    window.addEventListener('lumina:external-sync-now', onSyncNow);
    return () => {
      window.removeEventListener('lumina:external-sync-now', onSyncNow);
    };
  }, [userId, runSync]);

  // ── Effect 2: Stable background poll ─────────────────────────────────────
  // Only depends on userId + runSync — does NOT restart on every navigation.
  // Reads the current date from the ref at the time each tick fires.
  useEffect(() => {
    if (!userId) return;

    const id = setInterval(() => {
      runSync(computeRange(dateRef.current), { showLoader: false });
    }, POLL_INTERVAL_MS);

    return () => clearInterval(id);
  }, [userId, runSync]);

  useEffect(() => {
    if (!userId) return;

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;

      const now = Date.now();
      if (now - lastFocusSyncAtRef.current < FOCUS_SYNC_MIN_INTERVAL_MS) return;
      lastFocusSyncAtRef.current = now;

      runSync(computeRange(dateRef.current), { showLoader: false });
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [userId, runSync]);

  return null;
}
