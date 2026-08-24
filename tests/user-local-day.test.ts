/**
 * P2-8 — "today" was computed in the server's timezone.
 *
 * `new Date(y, m, d)` resolves in the runtime's zone, which on Vercel is UTC.
 * The audit's concrete cases:
 *
 *   - a user in UTC-8 finishing their fifth task at 5pm local is at 01:00 UTC
 *     the NEXT day, so `task_burst_5` counted it into tomorrow and never fired;
 *   - `first_task_day` fired twice inside one local day;
 *   - "completed on due date" flipped a day early or late for anyone west of
 *     Greenwich;
 *   - the streak day came from a CLIENT-SUPPLIED `body.timezone`, so a client
 *     claiming `Pacific/Kiritimati` (UTC+14) could bump `dailyStreak` twice in
 *     one real day.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { taskCompleteAwards } from '@/lib/coins/earnRules';
import { userDayBounds } from '@/lib/time/userDay';
import { invalidateUserTimeZone } from '@/lib/time/eventTimeZone';
import { adoptBrowserTimeZone } from '@/lib/time/adoptBrowserTimeZone';

/** Minimal stand-in for the drizzle chain `getUserTimeZone` walks. */
const dbReturning = (timezone: string | null) => ({
  select: () => ({
    from: () => ({
      where: () => ({ limit: async () => [{ timezone }] }),
    }),
  }),
});

const reasons = (awards: ReturnType<typeof taskCompleteAwards>) =>
  awards.map((a) => a.reason);

describe('P2-8 — due-date awards compare calendar days, not Date objects', () => {
  it('pays task_on_time when the due day IS today', () => {
    expect(reasons(taskCompleteAwards('medium', '2026-08-24', '2026-08-24', false)))
      .toEqual(['task_complete', 'task_on_time']);
  });

  it('pays task_early when the due day is later', () => {
    expect(reasons(taskCompleteAwards('medium', '2026-08-25', '2026-08-24', false)))
      .toEqual(['task_complete', 'task_early']);
  });

  it('pays neither bonus when the due day has passed', () => {
    expect(reasons(taskCompleteAwards('medium', '2026-08-23', '2026-08-24', false)))
      .toEqual(['task_complete']);
  });

  it('pays only the base award when there is no due date', () => {
    expect(reasons(taskCompleteAwards('hard', null, '2026-08-24', false)))
      .toEqual(['task_complete']);
  });

  it('the multiplier still doubles the total', () => {
    const awards = taskCompleteAwards('hard', '2026-08-24', '2026-08-24', true);
    const base = 10 + 5;
    expect(awards.find((a) => a.reason === 'task_multiplier_2x')?.amount).toBe(base);
  });

  it('does not flip the verdict for a user west of Greenwich', () => {
    // A task due 2026-08-24, completed at 5pm on the 24th in Los Angeles. That
    // instant is 2026-08-25T00:00Z, so the old UTC-day comparison saw "due
    // yesterday" and paid nothing. Both days now come from the same zone.
    const dueDayLocal = '2026-08-24';
    const todayLocal = '2026-08-24';
    expect(reasons(taskCompleteAwards('medium', dueDayLocal, todayLocal, false)))
      .toContain('task_on_time');
  });
});

describe('P2-8 — userDayBounds follows the user, not the runtime', () => {
  beforeEach(() => invalidateUserTimeZone());

  it('brackets a local day that straddles UTC midnight', async () => {
    // 17:00 on 2026-08-24 in Los Angeles == 2026-08-25T00:00Z.
    const at5pmLocal = new Date('2026-08-25T00:00:00.000Z');
    const day = await userDayBounds(dbReturning('America/Los_Angeles'), 'u', at5pmLocal);

    expect(day.zone).toBe('America/Los_Angeles');
    expect(day.date).toBe('2026-08-24');
    expect(day.start.getTime()).toBeLessThanOrEqual(at5pmLocal.getTime());
    expect(day.end.getTime()).toBeGreaterThan(at5pmLocal.getTime());
  });

  it('the UTC runtime would have put that instant in the NEXT day', () => {
    // The bug, stated as an assertion so nobody "simplifies" the helper back.
    const at5pmLocal = new Date('2026-08-25T00:00:00.000Z');
    expect(at5pmLocal.toISOString().slice(0, 10)).toBe('2026-08-25');
  });

  it('spans 24 hours on an ordinary day', async () => {
    const day = await userDayBounds(dbReturning('Europe/Berlin'), 'u', new Date('2026-08-24T12:00:00.000Z'));
    expect(day.end.getTime() - day.start.getTime()).toBe(24 * 3_600_000);
  });

  it('spans 23 hours on a spring-forward day', async () => {
    // Europe/Berlin loses an hour on 2026-03-29.
    const day = await userDayBounds(dbReturning('Europe/Berlin'), 'u', new Date('2026-03-29T12:00:00.000Z'));
    expect(day.date).toBe('2026-03-29');
    expect(day.end.getTime() - day.start.getTime()).toBe(23 * 3_600_000);
  });

  it('falls back to UTC when the column is empty', async () => {
    const day = await userDayBounds(dbReturning(null), 'u', new Date('2026-08-24T12:00:00.000Z'));
    expect(day.zone).toBe('UTC');
    expect(day.start.toISOString()).toBe('2026-08-24T00:00:00.000Z');
  });

  it('falls back to UTC on a junk zone rather than trusting it', async () => {
    const day = await userDayBounds(dbReturning('Mars/Olympus_Mons'), 'u', new Date('2026-08-24T12:00:00.000Z'));
    expect(day.zone).toBe('UTC');
  });
});

describe('P2-8 — the browser seeds users.timezone, but never overrides it', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(() => Promise.resolve({ ok: true } as Response));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const sentZone = () => {
    const body = fetchMock.mock.calls[0]?.[1]?.body as string | undefined;
    return body ? (JSON.parse(body) as { timezone: string }).timezone : undefined;
  };

  it('writes when nothing is stored', () => {
    adoptBrowserTimeZone(null);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/users/preferences');
    expect(sentZone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it("writes when the stored value is the 'never set' UTC default", () => {
    adoptBrowserTimeZone('UTC');
    // Only if the test machine is not actually on UTC — otherwise the value
    // already matches and there is nothing to write.
    const browser = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(fetchMock).toHaveBeenCalledTimes(browser === 'UTC' ? 0 : 1);
  });

  it('leaves a deliberate setting alone', () => {
    // Overwriting on every mismatch would silently rewrite the zone of a user
    // who picked one in Settings and then travelled.
    adoptBrowserTimeZone('Asia/Tokyo');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('writes nothing when the runtime reports no zone', () => {
    const spy = vi
      .spyOn(Intl, 'DateTimeFormat')
      .mockImplementation(() => ({ resolvedOptions: () => ({}) }) as unknown as Intl.DateTimeFormat);
    adoptBrowserTimeZone(null);
    expect(fetchMock).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('P2-8 — the handlers no longer compute days in the server zone', () => {
  const read = (...parts: string[]) =>
    readFileSync(join(process.cwd(), 'src', ...parts), 'utf8');

  it('the focus streak ignores the client-supplied timezone', () => {
    const src = read('app', 'api', 'focus-sessions', 'route.ts');
    // The field fed `computeStreakUpdate` directly, so a client claiming UTC+14
    // rolled the streak day forward early.
    expect(src).not.toContain("typeof body.timezone === 'string' ? body.timezone");
    expect(src).toContain('await getUserTimeZone(db, userId)');
  });

  it('the task burst count is bounded by the user local day', () => {
    const src = read('app', 'api', 'tasks', '[id]', 'route.ts');
    expect(src).toContain('await userDayBounds(db, userId)');
    expect(src).not.toContain('today.getFullYear(), today.getMonth(), today.getDate()');
    expect(src).not.toContain("dueDate?.toISOString().slice(0, 10)");
  });

  it('planner-items uses the user zone for both the filter and the award', () => {
    const src = read('app', 'api', 'planner-items', 'route.ts');
    expect(src).toContain('zonedDayBounds(dateParam, zone)');
    expect(src).toContain('await userDayBounds(db, userId)');
    expect(src).not.toContain('new Date(y, m - 1, d, 0, 0, 0, 0)');
  });

  it('changing the timezone drops the memo', () => {
    const src = read('app', 'api', 'users', 'preferences', 'route.ts');
    expect(src).toContain('invalidateUserTimeZone(session.user.id)');
  });

  it('the reward cap bucket stays on UTC on purpose', () => {
    // `daily_reward_caps.bucket_date` is deliberately timezone-immune: a cap
    // that moved with a client-controlled zone could be reset by claiming to
    // have flown east.
    const src = read('app', 'api', 'tasks', '[id]', 'route.ts');
    expect(src).toContain('utcDateKey(new Date())');
  });
});
