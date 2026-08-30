/**
 * A planned task must come back on the day it was planned for.
 *
 * `plannerPersistence` converts between the store's shape (a local `planDate`
 * plus `HH:mm` times) and the API's (two ISO instants). The write side parses
 * as local:
 *
 *     new Date(`${item.planDate}T${item.startTime}:00`).toISOString()
 *
 * — no timezone suffix, so the runtime reads it in the viewer's zone. The read
 * side then disagreed with itself inside four lines:
 *
 *     const planDate  = start.toISOString().slice(0, 10);   // UTC
 *     const startTime = `${String(start.getHours())…}`;     // LOCAL
 *
 * Same `Date`, two different zones. So an item whose local time falls on the
 * far side of UTC midnight came back with the correct clock time on the WRONG
 * DAY — and because `fromApiRow` feeds hydration, it moved every time the
 * planner loaded.
 *
 * East of UTC that is the small hours (01:00 in Cairo is 22:00 UTC the day
 * before); west of UTC it is the late evening.
 */
import { describe, it, expect } from 'vitest';
import { toISOTimestamps, fromApiRow } from '@/lib/persistence/plannerPersistence';
import type { PlannedTaskItem } from '@/store/useDailyPlanStore';

/** An hour whose local date and UTC date differ, chosen from the runner's offset. */
function straddlingLocalHour(): { planDate: string; startTime: string; endTime: string } | null {
  const offsetMinutes = -new Date().getTimezoneOffset();
  if (offsetMinutes === 0) return null;
  return offsetMinutes > 0
    // East of UTC: early morning local is the previous day in UTC.
    ? { planDate: '2026-09-02', startTime: '01:00', endTime: '02:00' }
    // West of UTC: late evening local is the next day in UTC.
    : { planDate: '2026-09-02', startTime: '22:00', endTime: '23:00' };
}

function item(over: Partial<PlannedTaskItem>): PlannedTaskItem {
  return {
    id: 'plan-1',
    taskId: 'task-1',
    planDate: '2026-09-02',
    startTime: '09:00',
    endTime: '10:00',
    order: 0,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...over,
  } as PlannedTaskItem;
}

function roundTrip(source: PlannedTaskItem): PlannedTaskItem {
  const { startTime, endTime } = toISOTimestamps(source);
  return fromApiRow({
    id: source.id,
    taskId: source.taskId,
    startTime,
    endTime,
    isAutoScheduled: false,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  });
}

describe('planDate survives a round trip through the API shape', () => {
  it('keeps a mid-morning item on its day', () => {
    // The easy case, which always worked — 09:00 local is the same date in UTC
    // for every offset the world actually uses.
    const source = item({ planDate: '2026-09-02', startTime: '09:00', endTime: '10:00' });
    const back = roundTrip(source);
    expect(back.planDate).toBe('2026-09-02');
    expect(back.startTime).toBe('09:00');
  });

  it('keeps an item that straddles UTC midnight on its day', () => {
    // The bug. The clock time always came back right; the DAY did not.
    const straddling = straddlingLocalHour();
    if (!straddling) return; // a UTC runner cannot reproduce it

    const source = item(straddling);
    const back = roundTrip(source);

    expect(back.startTime).toBe(straddling.startTime);
    expect(
      back.planDate,
      'the item moved to a different day — planDate is being derived in a different zone from startTime',
    ).toBe(straddling.planDate);
  });

  it('derives the date and the time in the SAME zone', () => {
    // The property underneath both cases: whatever zone `startTime` is read
    // in, `planDate` has to be read in too. Reconstructing the local instant
    // from the returned pair must land back on the instant we sent.
    const straddling = straddlingLocalHour() ?? { planDate: '2026-09-02', startTime: '09:00', endTime: '10:00' };
    const source = item(straddling);
    const { startTime: sentIso } = toISOTimestamps(source);
    const back = roundTrip(source);

    const reconstructed = new Date(`${back.planDate}T${back.startTime}:00`).toISOString();
    expect(reconstructed).toBe(sentIso);
  });
});
