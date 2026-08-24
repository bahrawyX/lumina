/**
 * P0-6 / P2-9 — recurrence must not drift across a DST transition.
 *
 * `rrule` has no timezone support: it works on `Date` objects and steps in UTC.
 * That was harmless only while event times were stored as floating wall-clock
 * coerced to UTC. Once instants are stored correctly, a daily 3pm New York
 * event has DTSTART 19:00Z, and a naive UTC expansion emits 19:00Z every day —
 * which is 3pm in summer and **2pm in winter**. The event silently moves an
 * hour every transition.
 */
import { describe, it, expect } from 'vitest';
import { expandRecurrence } from '@/lib/recurrence/rruleEngine';
import { utcToZonedWallClock, zonedWallClockToUtc } from '@/lib/time/zonedTime';

const NY = 'America/New_York';
const HOUR = 60 * 60 * 1000;

/** Local clock readings for every occurrence, in the event's zone. */
function localTimes(instances: Array<{ startIso: string }>, zone: string): string[] {
  return instances.map((i) => utcToZonedWallClock(new Date(i.startIso), zone).time);
}

describe('expandRecurrence — zoned expansion holds the local time', () => {
  it('a daily 3pm New York event stays at 15:00 across the autumn transition', () => {
    // DST 2026 ends 01 November. Expand a window straddling it.
    const dtstart = zonedWallClockToUtc('2026-10-29', '15:00', NY)!;
    const instances = expandRecurrence(
      { rrule: 'FREQ=DAILY', dtstart: dtstart.toISOString(), exdates: [] },
      zonedWallClockToUtc('2026-10-29', '00:00', NY)!,
      zonedWallClockToUtc('2026-11-05', '23:59', NY)!,
      HOUR,
      NY,
    );

    expect(instances.length).toBeGreaterThan(5);
    const times = new Set(localTimes(instances, NY));
    // Every single occurrence reads 15:00 locally.
    expect([...times]).toEqual(['15:00']);
  });

  it('a daily 9am New York event stays at 09:00 across the spring transition', () => {
    // DST 2026 begins 08 March.
    const dtstart = zonedWallClockToUtc('2026-03-05', '09:00', NY)!;
    const instances = expandRecurrence(
      { rrule: 'FREQ=DAILY', dtstart: dtstart.toISOString(), exdates: [] },
      zonedWallClockToUtc('2026-03-05', '00:00', NY)!,
      zonedWallClockToUtc('2026-03-12', '23:59', NY)!,
      HOUR,
      NY,
    );
    expect([...new Set(localTimes(instances, NY))]).toEqual(['09:00']);
  });

  it('the UTC offset genuinely changes across the transition — the expansion is not trivially constant', () => {
    const dtstart = zonedWallClockToUtc('2026-10-29', '15:00', NY)!;
    const instances = expandRecurrence(
      { rrule: 'FREQ=DAILY', dtstart: dtstart.toISOString(), exdates: [] },
      zonedWallClockToUtc('2026-10-29', '00:00', NY)!,
      zonedWallClockToUtc('2026-11-05', '23:59', NY)!,
      HOUR,
      NY,
    );
    const utcHours = new Set(instances.map((i) => new Date(i.startIso).getUTCHours()));
    // 19:00Z before the change, 20:00Z after. If this were one value, the test
    // above would be passing for the wrong reason.
    expect(utcHours.size).toBe(2);
    expect([...utcHours].sort()).toEqual([19, 20]);
  });

  it('WITHOUT a timezone the old UTC behaviour is preserved (offset fixed, local time drifts)', () => {
    // Callers that pass no zone — or 'UTC' — get exactly what they got before,
    // so this change cannot alter an existing UTC-only expansion.
    const dtstart = zonedWallClockToUtc('2026-10-29', '15:00', NY)!;
    const instances = expandRecurrence(
      { rrule: 'FREQ=DAILY', dtstart: dtstart.toISOString(), exdates: [] },
      zonedWallClockToUtc('2026-10-29', '00:00', NY)!,
      zonedWallClockToUtc('2026-11-05', '23:59', NY)!,
      HOUR,
    );
    const utcHours = new Set(instances.map((i) => new Date(i.startIso).getUTCHours()));
    expect(utcHours.size).toBe(1);
    // ...and that is exactly the drift: local time is no longer 15:00 throughout.
    expect(new Set(localTimes(instances, NY)).size).toBe(2);
  });
});

describe('expandRecurrence — zoned expansion keeps the other guarantees', () => {
  it('duration is applied in real time, so an event straddling the change keeps its length', () => {
    const dtstart = zonedWallClockToUtc('2026-11-01', '01:00', NY)!;
    const instances = expandRecurrence(
      { rrule: 'FREQ=DAILY', dtstart: dtstart.toISOString(), exdates: [] },
      zonedWallClockToUtc('2026-11-01', '00:00', NY)!,
      zonedWallClockToUtc('2026-11-02', '23:59', NY)!,
      2 * HOUR,
      NY,
    );
    for (const inst of instances) {
      const span = new Date(inst.endIso).getTime() - new Date(inst.startIso).getTime();
      expect(span).toBe(2 * HOUR);
    }
  });

  it('honours exdates', () => {
    const dtstart = zonedWallClockToUtc('2026-08-24', '15:00', NY)!;
    const skip = zonedWallClockToUtc('2026-08-26', '15:00', NY)!;
    const instances = expandRecurrence(
      { rrule: 'FREQ=DAILY', dtstart: dtstart.toISOString(), exdates: [skip.toISOString()] },
      zonedWallClockToUtc('2026-08-24', '00:00', NY)!,
      zonedWallClockToUtc('2026-08-28', '23:59', NY)!,
      HOUR,
      NY,
    );
    const dates = instances.map((i) => utcToZonedWallClock(new Date(i.startIso), NY).date);
    expect(dates).not.toContain('2026-08-26');
    expect(dates).toContain('2026-08-25');
  });

  it('clips to the requested window despite widening the floating one', () => {
    // The zoned path widens the floating window by a day at each edge so an
    // occurrence near the boundary is not lost to the offset; it must then
    // re-clip against the real range.
    const dtstart = zonedWallClockToUtc('2026-08-01', '15:00', NY)!;
    const rangeStart = zonedWallClockToUtc('2026-08-10', '00:00', NY)!;
    const rangeEnd = zonedWallClockToUtc('2026-08-12', '23:59', NY)!;
    const instances = expandRecurrence(
      { rrule: 'FREQ=DAILY', dtstart: dtstart.toISOString(), exdates: [] },
      rangeStart,
      rangeEnd,
      HOUR,
      NY,
    );
    for (const inst of instances) {
      const t = new Date(inst.startIso).getTime();
      expect(t).toBeGreaterThanOrEqual(rangeStart.getTime());
      expect(t).toBeLessThanOrEqual(rangeEnd.getTime());
    }
    expect(instances).toHaveLength(3);
  });

  it('a weekly rule keeps its weekday in local terms', () => {
    const dtstart = zonedWallClockToUtc('2026-10-27', '20:00', NY)!; // Tuesday
    const instances = expandRecurrence(
      { rrule: 'FREQ=WEEKLY;BYDAY=TU', dtstart: dtstart.toISOString(), exdates: [] },
      zonedWallClockToUtc('2026-10-27', '00:00', NY)!,
      zonedWallClockToUtc('2026-11-25', '23:59', NY)!,
      HOUR,
      NY,
    );
    expect([...new Set(localTimes(instances, NY))]).toEqual(['20:00']);
    for (const inst of instances) {
      const local = utcToZonedWallClock(new Date(inst.startIso), NY);
      const [y, m, d] = local.date.split('-').map(Number);
      // Tuesday in local terms.
      expect(new Date(Date.UTC(y, m - 1, d)).getUTCDay()).toBe(2);
    }
  });
});
