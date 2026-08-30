/**
 * "Scheduled 09:00–10:00" on a task card, and the day it looks that up for.
 *
 * The planner keys every plan item by LOCAL date. The store's default is
 * `format(new Date(), 'yyyy-MM-dd')`, navigation writes `format(next,
 * 'yyyy-MM-dd')`, and `todayKey()` — exported from the same store and used by
 * `DailyPlanView`, `IntelligencePanel`, `useCalendarStore` and
 * `useIntelligenceStore` — is the same call.
 *
 * `TaskCard` was the one place that rolled its own:
 *
 *     const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);
 *
 * `toISOString()` is UTC. So the card looked up a different day from the one
 * the planner had written to, for every hour of the day where the viewer's
 * local date and the UTC date disagree — and the "Scheduled …" badge simply
 * vanished from every card.
 *
 * How long that window lasts is the viewer's UTC offset:
 *
 *   - New York (UTC-5): from ~19:00 local until midnight — the evening.
 *   - Berlin (UTC+2): from midnight until ~02:00.
 *   - Sydney (UTC+10): from ~10:00 local until midnight — most of a working day.
 *
 * The comment above it read "changes only when the calendar day rolls over
 * (memoised once per mount)", which `useMemo(…, [])` does not do either.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { todayKey } from '@/store/useDailyPlanStore';

const taskCard = readFileSync(
  join(process.cwd(), 'src', 'components', 'tasks', 'TaskCard.tsx'),
  'utf8',
);

afterEach(() => {
  vi.useRealTimers();
});

/**
 * The bug is a disagreement between two ways of naming "today", so it only
 * reproduces at an instant where they differ. 23:30 UTC is such an instant for
 * every zone with a positive offset, and 00:30 UTC for every negative one.
 */
function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

describe('the card and the planner name the same day', () => {
  it('the two derivations really can disagree', () => {
    /**
     * The failure needs an instant where the local and UTC dates differ, which
     * depends on the runner's offset — so pick the instant from the offset
     * rather than hard-coding one. On a genuinely UTC runner no such instant
     * exists and there is nothing to demonstrate; the source-level guards
     * below are what protect that case.
     *
     * Written down because it reproduced here: this machine is Africa/Cairo
     * (UTC+3), and at 23:30Z the planner says one day and `toISOString()` says
     * the day before.
     */
    const offsetMinutes = -new Date().getTimezoneOffset();
    if (offsetMinutes === 0) return;

    // Land 30 minutes on the far side of local midnight.
    const instant = offsetMinutes > 0
      ? new Date('2026-09-01T23:30:00.000Z')   // east of UTC: local is already tomorrow
      : new Date('2026-09-02T00:30:00.000Z');  // west of UTC: local is still yesterday

    vi.useFakeTimers();
    vi.setSystemTime(instant);

    expect(
      todayKey(),
      'local and UTC agree at this instant — the chosen time does not straddle local midnight',
    ).not.toBe(utcDateKey(new Date()));
  });

  it('does not derive its own date key from toISOString', () => {
    // This is the actual regression guard. `toISOString().slice(0, 10)` is UTC
    // and the planner is local; the two cannot be made to agree by accident.
    const code = taskCard.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/toISOString\(\)\s*\.\s*slice\(0,\s*10\)/);
  });

  it('uses the shared helper the rest of the app uses', () => {
    expect(taskCard).toMatch(/import .*todayKey.*from .*useDailyPlanStore/);
  });

  it('re-reads the day rather than memoising it once per mount', () => {
    // The old comment promised "changes only when the calendar day rolls
    // over"; `useMemo(…, [])` never recomputes, so a board left open past
    // midnight kept yesterday's key until the tab was reloaded.
    const code = taskCard.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/useMemo\(\(\)\s*=>\s*new Date\(\)/);
  });
});

describe('todayKey itself', () => {
  it('is local, which is the whole point', () => {
    // If this ever became UTC the planner and the card would agree again — and
    // both be wrong for the viewer.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T12:00:00.000Z'));
    const local = new Date();
    const expected = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
    expect(todayKey()).toBe(expected);
  });
});
