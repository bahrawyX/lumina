'use client';

import React, { useState, useTransition } from 'react';
import { authClient } from '@/lib/auth-client';
import { useCalendarEventsStore } from '@/store/useCalendarEventsStore';
import * as eventsPersistence from '@/lib/persistence/eventsPersistence';

// ── Inline SVG icons (lucide-react shapes, no external dep) ──────────────────
const CalendarDaysIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
    <line x1="8" y1="14" x2="8" y2="14"/>
    <line x1="12" y1="14" x2="12" y2="14"/>
    <line x1="16" y1="14" x2="16" y2="14"/>
  </svg>
);

const RefreshIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10"/>
    <polyline points="1 20 1 14 7 14"/>
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
    <polyline points="22 4 12 14.01 9 11.01"/>
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

interface SyncResult {
  calendarsImported: number;
  eventsInserted: number;
  eventsUpdated: number;
  calendarResults: Array<{ name: string; inserted: number; updated: number; skipped: number }>;
}

/**
 * GoogleCalendarSync
 *
 * Minimal UI trigger for Google Calendar import.
 * Only visible when the user is signed in with Google.
 *
 * Rules:
 * - Never calls Google APIs directly (all calls go through /api/integrations/google/*)
 * - After sync completes, refreshes the events store via existing persistence path
 * - No global rerender storms — only updates the events store state
 */
export function GoogleCalendarSync() {
  const { data: session } = authClient.useSession();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<SyncResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Only show for Google-authenticated users
  const isGoogleUser = session?.user != null;
  if (!isGoogleUser) return null;

  const handleSync = () => {
    startTransition(async () => {
      setStatus('syncing');
      setResult(null);
      setErrorMessage('');

      try {
        const res = await fetch('/api/integrations/google/events/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'full' }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error ?? `Sync failed (${res.status})`);
        }

        setStatus('success');
        setResult({
          calendarsImported: data.calendarsImported ?? 0,
          eventsInserted: data.eventsInserted ?? 0,
          eventsUpdated: data.eventsUpdated ?? 0,
          calendarResults: data.calendarResults ?? [],
        });

        // Refresh the events store with the latest DB state so imported events
        // appear immediately without a full page reload.
        const freshEvents = await eventsPersistence.fetchAllForCurrentUser();
        useCalendarEventsStore.setState({
          events: freshEvents as any,
          history: [{ events: freshEvents as any }],
          historyIndex: 0,
          dbHydrated: true,
        });
      } catch (err) {
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : 'Sync failed. Please try again.');
      }
    });
  };

  const isSyncing = isPending || status === 'syncing';

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0 text-blue-600 dark:text-blue-400">
          <CalendarDaysIcon />
        </div>
        <div>
          <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100">
            Google Calendar
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Import events from your Google calendars
          </p>
        </div>
      </div>

      {/* Status feedback */}
      {status === 'success' && result && (
        <div className="flex items-start gap-2 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800 px-4 py-3">
          <span className="text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0"><CheckIcon /></span>
          <div className="text-xs text-green-700 dark:text-green-300 space-y-0.5">
            <p className="font-medium">Sync complete</p>
            <p>
              {result.calendarsImported} calendar{result.calendarsImported !== 1 ? 's' : ''} •{' '}
              {result.eventsInserted} new event{result.eventsInserted !== 1 ? 's' : ''} •{' '}
              {result.eventsUpdated} updated
            </p>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 px-4 py-3">
          <span className="text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0"><AlertIcon /></span>
          <div className="text-xs text-red-700 dark:text-red-300">
            <p className="font-medium">Sync failed</p>
            <p className="mt-0.5 opacity-80">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Action */}
      <button
        onClick={handleSync}
        disabled={isSyncing}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary text-white text-sm font-medium py-2.5 px-4 transition-opacity hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isSyncing ? (
          <>
            <SpinnerIcon />
            Syncing…
          </>
        ) : (
          <>
            <RefreshIcon />
            {status === 'success' ? 'Sync again' : 'Sync Google Calendar'}
          </>
        )}
      </button>

      <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center">
        Read-only import · 90 days past → 1 year ahead · No data is written back to Google
      </p>
    </div>
  );
}
