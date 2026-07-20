/**
 * Windowed external-event store (the fix for "events for an already-viewed month
 * disappear on return"): retained date-windows accumulate so revisiting a month
 * renders from memory, refreshing a window replaces it in place (deletions
 * propagate), overlaps de-dup, and growth is capped (LRU eviction).
 */
import { describe, it, expect } from 'vitest';
import {
  mergeEventWindow,
  flattenEventWindows,
  MAX_EVENT_WINDOWS,
  type EventWindow,
} from '@/lib/calendar/eventWindows';
import type { CalendarEvent } from '@/types';

function evt(id: string, date: string): CalendarEvent {
  return {
    id,
    title: id,
    description: '',
    date,
    startTime: '10:00',
    endTime: '11:00',
    timezone: 'UTC',
    category: 'Work',
    color: '#000000',
  } as CalendarEvent;
}

describe('event windows — accumulate, refresh, cap', () => {
  it('accumulates events across distinct windows (viewed months stay available)', () => {
    let w: EventWindow[] = [];
    w = mergeEventWindow(w, '2026-01-01', '2026-01-31', [evt('ms:a', '2026-01-10')]);
    w = mergeEventWindow(w, '2026-02-01', '2026-02-28', [evt('ms:b', '2026-02-10')]);

    const ids = flattenEventWindows(w).map((e) => e.id).sort();
    expect(ids).toEqual(['ms:a', 'ms:b']); // January still present after viewing February
  });

  it('refreshing the same window replaces it in place (deletions propagate)', () => {
    let w: EventWindow[] = [];
    w = mergeEventWindow(w, '2026-01-01', '2026-01-31', [evt('ms:a', '2026-01-10'), evt('ms:b', '2026-01-20')]);
    // Re-fetch of the same range now returns only one event (the other was deleted).
    w = mergeEventWindow(w, '2026-01-01', '2026-01-31', [evt('ms:a', '2026-01-10')]);

    expect(w).toHaveLength(1); // not duplicated into a second window
    expect(flattenEventWindows(w).map((e) => e.id)).toEqual(['ms:a']);
  });

  it('de-dupes overlapping windows by id, newest copy wins', () => {
    let w: EventWindow[] = [];
    w = mergeEventWindow(w, '2026-01-01', '2026-01-31', [evt('ms:a', '2026-01-31')]);
    // Overlapping next window re-includes the same event with an edited title.
    const edited = { ...evt('ms:a', '2026-01-31'), title: 'edited' };
    w = mergeEventWindow(w, '2026-01-25', '2026-02-25', [edited, evt('ms:c', '2026-02-05')]);

    const flat = flattenEventWindows(w);
    expect(flat).toHaveLength(2); // ms:a not double-counted
    expect(flat.find((e) => e.id === 'ms:a')?.title).toBe('edited'); // newest wins
  });

  it('an event rescheduled into a later-fetched window renders only the fresher copy', () => {
    let w: EventWindow[] = [];
    // March fetched first — event ms:x lives on Mar 20 @ 09:00.
    w = mergeEventWindow(w, '2026-03-01', '2026-03-31', [
      { ...evt('ms:x', '2026-03-20'), startTime: '09:00' },
    ]);
    // The event is later rescheduled into April. The April window is fetched
    // AFTER March (so it is the most-recent window) and carries the new copy —
    // same id, different date/time. The stale March copy was never re-fetched.
    w = mergeEventWindow(w, '2026-04-01', '2026-04-30', [
      { ...evt('ms:x', '2026-04-05'), startTime: '14:00' },
    ]);

    const flat = flattenEventWindows(w);
    const copies = flat.filter((e) => e.id === 'ms:x');
    expect(copies).toHaveLength(1);            // never double-rendered
    expect(copies[0].date).toBe('2026-04-05'); // fresher (most-recently-merged) window wins
    expect(copies[0].startTime).toBe('14:00');
    // The stale March copy does not render.
    expect(flat.some((e) => e.date === '2026-03-20')).toBe(false);
  });

  it('caps at MAX_EVENT_WINDOWS, evicting the least-recently-viewed', () => {
    let w: EventWindow[] = [];
    for (let i = 0; i < MAX_EVENT_WINDOWS + 2; i += 1) {
      const key = `2026-${String(i + 1).padStart(2, '0')}-01`;
      w = mergeEventWindow(w, key, key, [evt(`ms:${i}`, key)]);
    }
    expect(w).toHaveLength(MAX_EVENT_WINDOWS);
    const ids = flattenEventWindows(w).map((e) => e.id);
    expect(ids).not.toContain('ms:0'); // first two windows evicted
    expect(ids).not.toContain('ms:1');
    expect(ids).toContain(`ms:${MAX_EVENT_WINDOWS + 1}`); // newest retained
  });

  it('revisiting an existing window refreshes its recency (LRU) without growing', () => {
    let w: EventWindow[] = [];
    // Fill to the cap.
    for (let i = 0; i < MAX_EVENT_WINDOWS; i += 1) {
      const key = `2026-${String(i + 1).padStart(2, '0')}-01`;
      w = mergeEventWindow(w, key, key, [evt(`ms:${i}`, key)]);
    }
    // Re-view the OLDEST window → it becomes most-recent, count unchanged.
    w = mergeEventWindow(w, '2026-01-01', '2026-01-01', [evt('ms:0', '2026-01-01')]);
    expect(w).toHaveLength(MAX_EVENT_WINDOWS);
    // Adding one more now evicts window #1 (the new oldest), not the just-revisited #0.
    w = mergeEventWindow(w, '2026-12-01', '2026-12-01', [evt('ms:new', '2026-12-01')]);
    const ids = flattenEventWindows(w).map((e) => e.id);
    expect(ids).toContain('ms:0');
    expect(ids).not.toContain('ms:1');
  });
});
