import type { CalendarEvent } from '@/types';

/** One fetched date-window's worth of external events, keyed by its range. */
export interface EventWindow {
  startKey: string; // YYYY-MM-DD, inclusive — the fetch range start
  endKey: string;   // YYYY-MM-DD, inclusive — the fetch range end
  events: CalendarEvent[];
}

/**
 * Max distinct date-windows retained per provider. Navigating beyond this many
 * windows evicts the least-recently-viewed one (LRU); returning to an evicted
 * window triggers a refetch. Six keeps roughly half a year of month-view
 * navigation resident while bounding memory over a long session. The arrays are
 * in-memory only (never persisted), so this is a soft working-set bound.
 */
export const MAX_EVENT_WINDOWS = 6;

/**
 * Insert or refresh a window, keeping only the most-recent MAX_EVENT_WINDOWS.
 *
 * A window with the same [startKey,endKey] is replaced in place — so a re-fetch
 * refreshes that range (picking up provider-side edits/deletions) — and moved to
 * the most-recent position (LRU). Returns a new array; never mutates the input.
 */
export function mergeEventWindow(
  windows: EventWindow[],
  startKey: string,
  endKey: string,
  events: CalendarEvent[],
): EventWindow[] {
  const withoutThis = windows.filter(
    (w) => !(w.startKey === startKey && w.endKey === endKey),
  );
  const next = [...withoutThis, { startKey, endKey, events }];
  return next.length > MAX_EVENT_WINDOWS
    ? next.slice(next.length - MAX_EVENT_WINDOWS)
    : next;
}

/**
 * Flatten retained windows into the rendered event array, de-duplicated by
 * event id. Windows overlap (fetch padding), so the same event can appear in
 * more than one; the most-recently-merged window wins (freshest copy).
 */
export function flattenEventWindows(windows: EventWindow[]): CalendarEvent[] {
  const byId = new Map<string, CalendarEvent>();
  for (const w of windows) {
    for (const e of w.events) byId.set(e.id, e);
  }
  return [...byId.values()];
}
