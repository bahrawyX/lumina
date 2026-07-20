/**
 * M regression: MONTHLY recurrence used to drift off the anchor day. A naive
 * `current.setMonth(getMonth()+1)` on a day-31 event overflowed February into
 * early March, after which `getDate()` never equalled 31 again and the series
 * silently died after the first month. These assertions fail against the old
 * code (which returned only the January occurrence) and pass against the fix,
 * which re-anchors to the original day-of-month and skips months too short to
 * contain it (RFC 5545 MONTHLY semantics).
 *
 * All dates are computed with the same local getters throughout the engine, so
 * these assertions are timezone-independent.
 */
import { describe, it, expect } from 'vitest';
import { expandRecurrences } from '@/utils/dateUtils';
import type { CalendarEvent } from '@/types';

function monthlyEvent(date: string, interval = 1): CalendarEvent {
  return {
    id: 'e1',
    title: 'Monthly',
    description: '',
    date,
    startTime: '10:00',
    endTime: '11:00',
    timezone: 'UTC',
    category: 'work',
    color: '#000000',
    recurrence: { frequency: 'MONTHLY', interval, endCondition: { type: 'NEVER' } },
  } as CalendarEvent;
}

function datesFor(event: CalendarEvent, from: string, to: string): string[] {
  return expandRecurrences(
    [event],
    new Date(`${from}T00:00:00`),
    new Date(`${to}T00:00:00`),
  ).map((i) => i.instanceDate);
}

describe('M — MONTHLY recurrence does not drift off the anchor day', () => {
  it('day-31 event recurs only in 31-day months (Feb/Apr/Jun/Sep/Nov skipped)', () => {
    // 2026 months with 31 days: Jan, Mar, May, Jul, Aug, Oct, Dec.
    const dates = datesFor(monthlyEvent('2026-01-31'), '2026-01-01', '2026-12-31');
    expect(dates).toEqual([
      '2026-01-31',
      '2026-03-31',
      '2026-05-31',
      '2026-07-31',
      '2026-08-31',
      '2026-10-31',
      '2026-12-31',
    ]);
    // Guards against the old bug that returned only ['2026-01-31'].
    expect(dates.length).toBe(7);
  });

  it('day-30 event skips only February', () => {
    const dates = datesFor(monthlyEvent('2026-01-30'), '2026-01-01', '2026-06-30');
    expect(dates).toEqual([
      '2026-01-30',
      '2026-03-30',
      '2026-04-30',
      '2026-05-30',
      '2026-06-30',
    ]);
  });

  it('mid-month event recurs every month with no drift', () => {
    const dates = datesFor(monthlyEvent('2026-01-15'), '2026-01-01', '2026-06-30');
    expect(dates).toEqual([
      '2026-01-15',
      '2026-02-15',
      '2026-03-15',
      '2026-04-15',
      '2026-05-15',
      '2026-06-15',
    ]);
  });

  it('respects an interval of 2 months', () => {
    const dates = datesFor(monthlyEvent('2026-01-15', 2), '2026-01-01', '2026-06-30');
    expect(dates).toEqual(['2026-01-15', '2026-03-15', '2026-05-15']);
  });
});
