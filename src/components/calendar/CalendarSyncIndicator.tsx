'use client';

import { usePlannerStore } from '@/store/usePlannerStore';

/**
 * Small "syncing" indicator for the calendar surface.
 *
 * Distinguishes an in-flight external-calendar fetch from a genuinely empty
 * calendar — before this, a connected account mid-sync looked identical to one
 * with no events (half the reported "events don't appear" symptom). Only renders
 * while a sync is in flight AND a provider is connected.
 *
 * Cheap by construction: the spinner is a transform-only rotation
 * (compositor-friendly, no layout/paint per frame) and disables itself under
 * `prefers-reduced-motion`.
 */
export function CalendarSyncIndicator({ className = '' }: { className?: string }) {
  const isSyncing = usePlannerStore((s) => s.isSyncing);
  const googleConnected = usePlannerStore((s) => s.googleConnected);
  const outlookConnected = usePlannerStore((s) => s.outlookConnected);

  if (!isSyncing || (!googleConnected && !outlookConnected)) return null;

  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 text-xs text-muted-foreground ${className}`}
    >
      <span
        aria-hidden
        className="size-3 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin motion-reduce:animate-none"
      />
      Syncing calendar…
    </span>
  );
}
