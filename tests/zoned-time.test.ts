/**
 * P0-6 — event times were stored as floating wall-clock coerced to UTC.
 *
 *     const parsed = new Date(`${date}T${time}:00.000Z`);   // always Z
 *
 * "3pm" became `15:00Z` wherever the user was, and `events.timezone` was
 * written and read by nothing. These tests pin the conversion that replaces it,
 * including the DST cases that were previously impossible to get right because
 * the offset was never consulted at all.
 */
import { describe, it, expect } from 'vitest';
import {
  isValidTimeZone,
  timeZoneOffsetMs,
  utcToZonedWallClock,
  zonedDayBounds,
  zonedToday,
  zonedWallClockToUtc,
} from '@/lib/time/zonedTime';

const HOUR = 60 * 60 * 1000;

describe('zonedWallClockToUtc — a wall clock reading maps to the right instant', () => {
  it('UTC is the identity case', () => {
    const d = zonedWallClockToUtc('2026-08-24', '15:00', 'UTC');
    expect(d?.toISOString()).toBe('2026-08-24T15:00:00.000Z');
  });

  it('New York in summer (UTC-4) shifts forward by 4h', () => {
    // The whole bug in one assertion: 3pm in New York is 19:00Z, not 15:00Z.
    const d = zonedWallClockToUtc('2026-08-24', '15:00', 'America/New_York');
    expect(d?.toISOString()).toBe('2026-08-24T19:00:00.000Z');
  });

  it('New York in winter (UTC-5) shifts forward by 5h', () => {
    const d = zonedWallClockToUtc('2026-01-15', '15:00', 'America/New_York');
    expect(d?.toISOString()).toBe('2026-01-15T20:00:00.000Z');
  });

  it('Tokyo (UTC+9) shifts backward by 9h, crossing the date line', () => {
    const d = zonedWallClockToUtc('2026-08-24', '08:00', 'Asia/Tokyo');
    expect(d?.toISOString()).toBe('2026-08-23T23:00:00.000Z');
  });

  it('Kolkata (UTC+5:30) handles a half-hour offset', () => {
    const d = zonedWallClockToUtc('2026-08-24', '10:15', 'Asia/Kolkata');
    expect(d?.toISOString()).toBe('2026-08-24T04:45:00.000Z');
  });

  it('Kathmandu (UTC+5:45) handles a quarter-hour offset', () => {
    const d = zonedWallClockToUtc('2026-08-24', '12:00', 'Asia/Kathmandu');
    expect(d?.toISOString()).toBe('2026-08-24T06:15:00.000Z');
  });

  it('rejects malformed input rather than producing a wrong instant', () => {
    expect(zonedWallClockToUtc('24-08-2026', '15:00', 'UTC')).toBeNull();
    expect(zonedWallClockToUtc('2026-08-24', '3pm', 'UTC')).toBeNull();
    expect(zonedWallClockToUtc('2026-08-24', '25:00', 'UTC')).toBeNull();
    expect(zonedWallClockToUtc('2026-08-24', '15:00', 'Not/AZone')).toBeNull();
  });
});

describe('zonedWallClockToUtc — DST transitions', () => {
  it('the hour before and after a spring-forward differ by ONE hour of real time', () => {
    // US DST 2026 begins 08 March at 02:00 local.
    const before = zonedWallClockToUtc('2026-03-08', '01:00', 'America/New_York');
    const after = zonedWallClockToUtc('2026-03-08', '03:00', 'America/New_York');
    expect(after!.getTime() - before!.getTime()).toBe(1 * HOUR);
  });

  it('a nonexistent local time resolves to a real instant, not NaN', () => {
    // 02:30 does not exist on 08 March 2026 in New York.
    const d = zonedWallClockToUtc('2026-03-08', '02:30', 'America/New_York');
    expect(d).not.toBeNull();
    expect(Number.isNaN(d!.getTime())).toBe(false);
  });

  it('an ambiguous local time resolves to the FIRST occurrence', () => {
    // US DST 2026 ends 01 November at 02:00; 01:30 occurs twice.
    const d = zonedWallClockToUtc('2026-11-01', '01:30', 'America/New_York');
    // First occurrence is EDT (UTC-4) => 05:30Z; second would be EST => 06:30Z.
    expect(d?.toISOString()).toBe('2026-11-01T05:30:00.000Z');
  });

  it('a full day spanning spring-forward is 23 hours long', () => {
    const bounds = zonedDayBounds('2026-03-08', 'America/New_York');
    expect(bounds!.end.getTime() - bounds!.start.getTime()).toBe(23 * HOUR);
  });

  it('a full day spanning fall-back is 25 hours long', () => {
    const bounds = zonedDayBounds('2026-11-01', 'America/New_York');
    expect(bounds!.end.getTime() - bounds!.start.getTime()).toBe(25 * HOUR);
  });
});

describe('utcToZonedWallClock — an instant renders as the local clock reading', () => {
  it('round-trips through the conversion', () => {
    for (const zone of [
      'UTC',
      'America/New_York',
      'Europe/Berlin',
      'Asia/Tokyo',
      'Asia/Kolkata',
      'Australia/Sydney',
      'Pacific/Kiritimati',
    ]) {
      const instant = zonedWallClockToUtc('2026-08-24', '15:00', zone)!;
      const back = utcToZonedWallClock(instant, zone);
      expect(back, zone).toEqual({ date: '2026-08-24', time: '15:00' });
    }
  });

  it('renders the same instant differently in different zones', () => {
    const instant = new Date('2026-08-24T19:00:00.000Z');
    expect(utcToZonedWallClock(instant, 'America/New_York')).toEqual({
      date: '2026-08-24',
      time: '15:00',
    });
    expect(utcToZonedWallClock(instant, 'Asia/Tokyo')).toEqual({
      date: '2026-08-25',
      time: '04:00',
    });
  });

  it('falls back to UTC for an unknown zone instead of throwing', () => {
    // A bad value in the column must not take down a calendar render.
    expect(utcToZonedWallClock(new Date('2026-08-24T19:00:00.000Z'), 'Not/AZone')).toEqual({
      date: '2026-08-24',
      time: '19:00',
    });
  });

  it('handles midnight without wrapping to hour 24', () => {
    const instant = zonedWallClockToUtc('2026-08-24', '00:00', 'Europe/Berlin')!;
    expect(utcToZonedWallClock(instant, 'Europe/Berlin')).toEqual({
      date: '2026-08-24',
      time: '00:00',
    });
  });
});

describe('zonedDayBounds — the local day, not the UTC day', () => {
  it('a UTC-8 day starts at 08:00Z', () => {
    const bounds = zonedDayBounds('2026-01-15', 'America/Los_Angeles');
    expect(bounds!.start.toISOString()).toBe('2026-01-15T08:00:00.000Z');
    expect(bounds!.end.toISOString()).toBe('2026-01-16T08:00:00.000Z');
  });

  it('a UTC+9 day starts the previous UTC day', () => {
    const bounds = zonedDayBounds('2026-08-24', 'Asia/Tokyo');
    expect(bounds!.start.toISOString()).toBe('2026-08-23T15:00:00.000Z');
  });

  it('an ordinary day is exactly 24 hours', () => {
    const bounds = zonedDayBounds('2026-08-24', 'Europe/Berlin');
    expect(bounds!.end.getTime() - bounds!.start.getTime()).toBe(24 * HOUR);
  });
});

describe('zonedToday — "today" depends on where you are', () => {
  it('is the next day in Tokyo when it is late evening in UTC', () => {
    const now = new Date('2026-08-24T22:00:00.000Z');
    expect(zonedToday('UTC', now)).toBe('2026-08-24');
    expect(zonedToday('Asia/Tokyo', now)).toBe('2026-08-25');
  });

  it('is the previous day in Los Angeles when it is early morning in UTC', () => {
    const now = new Date('2026-08-24T02:00:00.000Z');
    expect(zonedToday('UTC', now)).toBe('2026-08-24');
    expect(zonedToday('America/Los_Angeles', now)).toBe('2026-08-23');
  });
});

describe('timeZoneOffsetMs', () => {
  it('is zero for UTC', () => {
    expect(timeZoneOffsetMs(new Date('2026-08-24T12:00:00Z'), 'UTC')).toBe(0);
  });

  it('is negative west of Greenwich', () => {
    expect(timeZoneOffsetMs(new Date('2026-08-24T12:00:00Z'), 'America/New_York')).toBe(-4 * HOUR);
  });

  it('is positive east of Greenwich', () => {
    expect(timeZoneOffsetMs(new Date('2026-08-24T12:00:00Z'), 'Asia/Tokyo')).toBe(9 * HOUR);
  });

  it('tracks DST', () => {
    const winter = timeZoneOffsetMs(new Date('2026-01-15T12:00:00Z'), 'America/New_York');
    const summer = timeZoneOffsetMs(new Date('2026-07-15T12:00:00Z'), 'America/New_York');
    expect(winter).toBe(-5 * HOUR);
    expect(summer).toBe(-4 * HOUR);
  });
});

describe('isValidTimeZone', () => {
  it('accepts real zones', () => {
    for (const z of ['UTC', 'America/New_York', 'Europe/Lisbon', 'Asia/Kathmandu']) {
      expect(isValidTimeZone(z)).toBe(true);
    }
  });

  it('rejects junk and oversized input', () => {
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
    expect(isValidTimeZone('x'.repeat(200))).toBe(false);
  });
});
