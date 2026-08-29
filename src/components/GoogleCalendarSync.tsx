'use client';

import React, { useState, useTransition } from 'react';
import { authClient } from '@/lib/auth-client';
import { toast } from 'sonner';
import { usePlannerStore } from '@/store/usePlannerStore';
import { useCalendarStore } from '@/store/useCalendarStore';
import { ViewType } from '@/types';
import type { CalendarEvent, EventProvider } from '@/types';
import { setCache, invalidateRange } from '@/lib/calendar/externalEventsCache';
import type { ApiExternalEvent } from '@/lib/calendar/externalEventTypes';
import { CheckCircleIcon } from '@/components/icons/CheckIcons';

// ── Inline SVG icons ──────────────────────────────────────────────────────

const CalendarDaysIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
);

const AlertIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);

const SpinnerIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
    <line x1="12" y1="2" x2="12" y2="6"/>
    <line x1="12" y1="18" x2="12" y2="22"/>
    <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/>
    <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/>
    <line x1="2" y1="12" x2="6" y2="12"/>
    <line x1="18" y1="12" x2="22" y2="12"/>
    <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/>
    <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
  </svg>
);

// ── Helpers ───────────────────────────────────────────────────────────────

function fmt2(n: number) { return String(n).padStart(2, '0'); }

function apiToCalendarEvent(e: ApiExternalEvent): CalendarEvent {
  if (e.isAllDay) {
    return {
      id: `google:${e.externalEventId}`,
      title: e.title, description: e.description ?? '',
      date: e.startIso.slice(0, 10), startTime: '00:00', endTime: '23:59',
      timezone: e.timezone, location: e.location || undefined,
      category: 'Work', color: e.color,
      source: 'google', provider: 'google' as EventProvider,
      editable: false, readOnly: true, draggable: false, organizer: e.organizerEmail || undefined,
    };
  }
  const s = new Date(e.startIso), end = new Date(e.endIso);
  return {
    id: `google:${e.externalEventId}`,
    title: e.title, description: e.description ?? '',
    date: `${s.getFullYear()}-${fmt2(s.getMonth()+1)}-${fmt2(s.getDate())}`,
    startTime: `${fmt2(s.getHours())}:${fmt2(s.getMinutes())}`,
    endTime:   `${fmt2(end.getHours())}:${fmt2(end.getMinutes())}`,
    timezone: e.timezone, location: e.location || undefined,
    category: 'Work', color: e.color,
    source: 'google', provider: 'google' as EventProvider,
    editable: false, readOnly: true, draggable: false, organizer: e.organizerEmail || undefined,
  };
}

function getRangeForCurrentView(view: ViewType, currentDate: Date) {
  const d = new Date(currentDate);
  const now = d.getTime();
  let startMs: number, endMs: number;

  if (view === ViewType.MONTH) {
    startMs = new Date(d.getFullYear(), d.getMonth(), 1).getTime() - 7 * 86_400_000;
    endMs   = new Date(d.getFullYear(), d.getMonth() + 1, 0).getTime() + 7 * 86_400_000;
  } else if (view === ViewType.WEEK) {
    const dow = d.getDay();
    startMs = now - (dow + 2) * 86_400_000;
    endMs   = now + (6 - dow + 2) * 86_400_000;
  } else {
    startMs = now - 86_400_000;
    endMs   = now + 2 * 86_400_000;
  }

  return { start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString() };
}

// ── Component ─────────────────────────────────────────────────────────────

/**
 * GoogleCalendarSync
 *
 * UI trigger for a manual Google Calendar refresh.
 * Fetches events live from the Google Calendar API via the server-side
 * /api/external-events/google endpoint and caches them in the browser.
 * NEVER writes event rows to the database.
 */
export function GoogleCalendarSync() {
  const { data: session } = authClient.useSession();
  const setGoogleEvents   = usePlannerStore((s) => s.setGoogleEvents);
  const view        = useCalendarStore((s) => s.view);
  const currentDate = useCalendarStore((s) => s.currentDate);

  const [isPending, startTransition] = useTransition();
  const [status, setStatus]           = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [count, setCount]             = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  if (!session?.user?.id) return null;

  const userId = session.user.id;

  const handleSync = () => {
    startTransition(async () => {
      const loaderToastId = 'google-calendar-sync-loading';
      setStatus('syncing');
      setCount(0);
      setErrorMessage('');
      toast.loading('Syncing Google Calendar...', { id: loaderToastId });

      const range = getRangeForCurrentView(view, currentDate);

      // Invalidate the current range so the fetch is forced even if cached
      invalidateRange(userId, 'google', range.start.slice(0, 10), range.end.slice(0, 10));

      try {
        const url = new URL('/api/external-events/google', window.location.origin);
        url.searchParams.set('start', range.start);
        url.searchParams.set('end',   range.end);

        const res = await fetch(url.toString());
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error ?? `Fetch failed (${res.status})`);
        }

        const rawEvents: ApiExternalEvent[] = data.events ?? [];
        const mappedGoogle = rawEvents.map(apiToCalendarEvent);

        // Cache and populate the store — no DB write
        setCache(userId, 'google', range.start.slice(0, 10), range.end.slice(0, 10), mappedGoogle);
        setGoogleEvents(mappedGoogle);

        setStatus('success');
        setCount(mappedGoogle.length);
        toast.success(`Google Calendar synced (${mappedGoogle.length} events).`, {
          id: loaderToastId,
          duration: 2_500,
        });
      } catch (err) {
        setStatus('error');
        const message = err instanceof Error ? err.message : 'Fetch failed. Please try again.';
        setErrorMessage(message);
        toast.error(message, { id: loaderToastId, duration: 4_000 });
      }
    });
  };

  const isSyncing = isPending || status === 'syncing';


}
