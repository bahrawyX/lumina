/**
 * A date the user picked must be read back in the zone they picked it in.
 *
 * Lumina keys a lot of things by `YYYY-MM-DD` — plan items, task due dates,
 * the planner's view date. All of those are the VIEWER's day. There are two
 * ways to turn a `Date` into that string and only one of them is right:
 *
 *     formatDateISO(d)               // getFullYear/getMonth/getDate — local
 *     d.toISOString().slice(0, 10)   // UTC
 *
 * They agree for roughly 21 hours a day and disagree for the rest, and which
 * hours depends on the viewer's offset. Three separate places had picked the
 * UTC one:
 *
 *  1. `TaskCard` looked up "is this task planned for today" with a UTC key
 *     while the planner writes local ones, so the "Scheduled 09:00–10:00"
 *     badge vanished from every card for hours at a time.
 *
 *  2. `plannerPersistence.fromApiRow` derived `planDate` in UTC and
 *     `startTime`/`endTime` in local — same `Date`, two zones, four lines
 *     apart — so an item whose local time straddled UTC midnight came back on
 *     the wrong day, and moved again on every hydration.
 *
 *  3. `useQuickCaptureActions` converted a local-midnight `Date` (built by
 *     `QuickCaptureContext` with `setHours(0,0,0,0)`) through UTC, so east of
 *     UTC "Today" created a task due YESTERDAY — overdue on arrival.
 *
 * Three instances is a class, not a coincidence, so this guards the class.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { formatDateISO } from '@/utils/dateUtils';

afterEach(() => {
  vi.useRealTimers();
});

describe('formatDateISO is the local one', () => {
  it('names the day the viewer is actually in', () => {
    vi.useFakeTimers();
    // An instant that is a different date in UTC than in any non-zero offset.
    vi.setSystemTime(new Date('2026-09-01T23:30:00.000Z'));
    const now = new Date();
    const expected =
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(formatDateISO(now)).toBe(expected);
  });

  it('differs from the UTC derivation when the offset says it should', () => {
    const offsetMinutes = -new Date().getTimezoneOffset();
    if (offsetMinutes === 0) return; // nothing to tell apart on a UTC runner

    vi.useFakeTimers();
    vi.setSystemTime(
      offsetMinutes > 0
        ? new Date('2026-09-01T23:30:00.000Z')
        : new Date('2026-09-02T00:30:00.000Z'),
    );
    const now = new Date();
    expect(formatDateISO(now)).not.toBe(now.toISOString().slice(0, 10));
  });

  it('round-trips a local-midnight Date, which is what date pickers hand over', () => {
    // `QuickCaptureContext` does exactly this: `d.setHours(0, 0, 0, 0)`.
    const d = new Date(2026, 8, 2); // 2 Sep 2026, local midnight
    d.setHours(0, 0, 0, 0);
    expect(formatDateISO(d)).toBe('2026-09-02');
  });
});

/**
 * The sweep. Client code must not derive a user-facing day from `toISOString`.
 *
 * Deliberately scoped to client code: the server keys some things by UTC on
 * purpose (`dedupeKeys.utcDateKey` is a ledger key, not a day the user sees),
 * and `addDaysISO` in `dateUtils` does UTC arithmetic on a date-ONLY string
 * with `T00:00:00Z` on both ends — internally consistent, and its comment
 * explains that it is deliberate for DST immunity.
 */
describe('no client code derives a day from toISOString', () => {
  /**
   * Reviewed and correct. All three of the arithmetic ones share one shape:
   * they PARSE a date-only string with an explicit `T00:00:00Z` and emit UTC,
   * so the zone never changes underneath them. That is date arithmetic on a
   * calendar day, not a reading of "what day is it for this person" — and
   * doing it in UTC is what makes it immune to DST, which is the point.
   *
   * The distinction that matters: converting a Date that came from the CLOCK
   * or a PICKER is a local operation. Shifting a `YYYY-MM-DD` string that is
   * already correct is not.
   */
  const ALLOWED = new Set([
    // `addDaysISO` — `T00:00:00Z` in, UTC out. Its comment says DST-immune.
    'src/utils/dateUtils.ts',
    // `shiftedEndDate` — parses all three endpoints as `T00:00:00Z`, emits UTC.
    'src/store/useCalendarEventsStore.ts',
    // `getYesterday` — `T00:00:00Z` in, `setUTCDate`, UTC out.
    'src/utils/streaks/streakUtils.ts',
    // A filename stamp, not a day anything is keyed by.
    'src/components/settings/AccountDataSheet.tsx',
  ]);

  it('has no unreviewed instances left', () => {
    const tracked = execSync('git ls-files src', { encoding: 'utf8' })
      .split('\n')
      .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))
      // Server routes and server-only libs may legitimately key by UTC.
      .filter((f) => !f.startsWith('src/app/api/'))
      .filter((f) => !f.startsWith('src/lib/coins/'))
      .filter((f) => !f.startsWith('src/lib/time/'));

    const offenders: string[] = [];
    for (const file of tracked) {
      if (ALLOWED.has(file)) continue;
      const src = readFileSync(join(process.cwd(), file), 'utf8');
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      if (/toISOString\(\)\s*\.\s*(slice\(0,\s*10\)|split\('T'\)\[0\])/.test(code)) {
        offenders.push(file);
      }
    }

    expect(
      offenders,
      'these derive a calendar day in UTC; the app keys days by the viewer’s local date (use formatDateISO)',
    ).toEqual([]);
  });
});
