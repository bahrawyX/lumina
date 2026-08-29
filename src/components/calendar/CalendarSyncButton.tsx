'use client';

import { usePlannerStore } from '@/store/usePlannerStore';
import { triggerExternalSync } from '@/hooks/useOutlookSync';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Re-sync the connected external calendars, on demand.
 *
 * Everything this needs already existed and nothing called it.
 * `triggerExternalSync()` was an exported function with **zero callers**, and
 * `useOutlookSync` has listened for its `lumina:external-sync-now` event the
 * whole time — the only dispatchers were the sidebar's connect/disconnect
 * handlers. So a sync could be started by connecting an account and by the
 * ten-minute background poll, and by nothing a person could press.
 *
 * That is why "where is the refresh icon" had no answer: the two curved arrows
 * next to it were Undo and Redo, whose old circular glyph read as refresh.
 * Fixing the icon removed the *appearance* of a refresh control and left the
 * gap it had been standing in front of.
 *
 * Hidden entirely when no provider is connected, rather than shown disabled: a
 * greyed control invites a click and then explains nothing, and with no Google
 * or Outlook account there is genuinely nothing to re-fetch — the local
 * calendar is already the source of truth.
 */
export function CalendarSyncButton() {
  const isSyncing = usePlannerStore((s) => s.isSyncing);
  const googleConnected = usePlannerStore((s) => s.googleConnected);
  const outlookConnected = usePlannerStore((s) => s.outlookConnected);

  if (!googleConnected && !outlookConnected) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => triggerExternalSync()}
          disabled={isSyncing}
          aria-label={isSyncing ? 'Syncing calendars' : 'Sync calendars now'}
          aria-busy={isSyncing}
        >
          <svg
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={isSyncing ? 'animate-spin motion-reduce:animate-none' : undefined}
          >
            {/*
              The circular-arrows refresh glyph — deliberately, and only here.
              Undo/redo gave this shape up precisely so it could mean one thing
              in this toolbar: re-fetch.
            */}
            <path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-7.6-4.2" />
            <path d="M3 12a9 9 0 0 1 9-9 9 9 0 0 1 7.6 4.2" />
            <polyline points="21 3 21 8 16 8" />
            <polyline points="3 21 3 16 8 16" />
          </svg>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{isSyncing ? 'Syncing…' : 'Sync calendars now'}</TooltipContent>
    </Tooltip>
  );
}
