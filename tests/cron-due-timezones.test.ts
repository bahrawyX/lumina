/**
 * The notification crons applied their row cap BEFORE the local-hour filter.
 *
 *     .selectDistinct({…})                       // unordered
 *     .innerJoin(pushSubscriptions, …)
 *     .limit(MAX_USERS_PER_RUN)                  // <- 500
 *
 *     candidates.filter((u) => isLocalHour(u.timezone || 'UTC', HOUR, now))
 *
 * Past 500 push subscribers the database returns an arbitrary 500 rows, and
 * because nothing orders them, in practice the same 500 every hour. Roughly
 * 1/24th of that slice is due in any given hour and everyone outside it is
 * never notified — not late, never, at any hour on any day.
 *
 * These run against in-process PGlite. They never touch a real database.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { randomUUID } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import * as schema from '@/db/schema';

const DDL = `
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  timezone text,
  daily_streak integer NOT NULL DEFAULT 0,
  notification_preferences jsonb
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL
);
`;

const client = new PGlite();
const testDb = drizzle(client, { schema });

vi.mock('@/lib/db', () => ({ getDatabase: () => testDb, db: testDb }));

let resolveDueTimeZones: typeof import('@/lib/notifications/dueTimeZones')['resolveDueTimeZones'];
let dueTimeZoneFilter: typeof import('@/lib/notifications/dueTimeZones')['dueTimeZoneFilter'];

beforeAll(async () => {
  await client.exec(DDL);
  const mod = await import('@/lib/notifications/dueTimeZones');
  resolveDueTimeZones = mod.resolveDueTimeZones;
  dueTimeZoneFilter = mod.dueTimeZoneFilter;
});

beforeEach(async () => {
  await client.exec('DELETE FROM push_subscriptions; DELETE FROM users;');
});

/** A subscriber in `tz`. `null` tz exercises the unset-timezone branch. */
async function subscriber(tz: string | null, opts: { streak?: number } = {}): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO users (id, name, timezone, daily_streak, notification_preferences)
     VALUES ($1, 'U', $2, $3, '{"dailyBrief":true,"streakReminder":true}'::jsonb)`,
    [id, tz, opts.streak ?? 0],
  );
  await client.query(
    `INSERT INTO push_subscriptions (user_id, endpoint) VALUES ($1, 'https://push.example/x')`,
    [id],
  );
  return id;
}

/** Same, with a caller-chosen id so a test can control sort order. */
async function subscriberWithId(id: string, tz: string, streak: number): Promise<void> {
  await client.query(
    `INSERT INTO users (id, name, timezone, daily_streak, notification_preferences)
     VALUES ($1, 'U', $2, $3, '{"dailyBrief":true,"streakReminder":true}'::jsonb)`,
    [id, tz, streak],
  );
  await client.query(
    `INSERT INTO push_subscriptions (user_id, endpoint) VALUES ($1, 'https://push.example/x')`,
    [id],
  );
}

/** 2026-06-15T12:00:00Z — 08:00 in New York (UTC-4 in June), 21:00 in Tokyo. */
const NOON_UTC = new Date('2026-06-15T12:00:00.000Z');

describe('resolveDueTimeZones', () => {
  it('returns only the zones actually at that local hour', async () => {
    await subscriber('America/New_York'); // 08:00
    await subscriber('Asia/Tokyo'); // 21:00
    await subscriber('Europe/London'); // 13:00

    const due = await resolveDueTimeZones(8, NOON_UTC);

    expect(due.zones).toEqual(['America/New_York']);
    expect(due.includeUnset).toBe(false);
  });

  it('treats a NULL timezone as UTC, matching the old `u.timezone || "UTC"`', async () => {
    await subscriber(null);

    expect((await resolveDueTimeZones(12, NOON_UTC)).includeUnset).toBe(true);
    expect((await resolveDueTimeZones(8, NOON_UTC)).includeUnset).toBe(false);
  });

  it('does not set includeUnset when every row has a timezone', async () => {
    await subscriber('Etc/UTC');
    const due = await resolveDueTimeZones(12, NOON_UTC);
    expect(due.includeUnset).toBe(false);
    expect(due.zones).toEqual(['Etc/UTC']);
  });

  it('keeps legacy zone aliases that Intl.supportedValuesOf omits', async () => {
    // `US/Eastern` is a valid IANA alias — `Intl.DateTimeFormat` accepts it,
    // and older clients still emit it — but it is NOT among the canonical
    // names `Intl.supportedValuesOf` returns. Building the filter from that
    // canonical list, rather than from the zones actually stored, would have
    // silently dropped exactly the users hardest to notice missing.
    //
    // (Checked here rather than assumed: several aliases I expected to be
    // absent, `Asia/Calcutta` and `Europe/Kiev` among them, ARE in this
    // runtime's list.)
    expect(Intl.supportedValuesOf('timeZone')).not.toContain('US/Eastern');

    await subscriber('US/Eastern'); // == America/New_York -> 08:00 at noon UTC
    const due = await resolveDueTimeZones(8, NOON_UTC);
    expect(due.zones).toEqual(['US/Eastern']);
  });

  it('deduplicates — the query is over DISTINCT zones, not users', async () => {
    await subscriber('America/New_York');
    await subscriber('America/New_York');
    await subscriber('America/New_York');

    const due = await resolveDueTimeZones(8, NOON_UTC);
    expect(due.zones).toEqual(['America/New_York']);
  });
});

describe('dueTimeZoneFilter', () => {
  it('returns null when nobody is due, so the caller can skip the query', async () => {
    await subscriber('Asia/Tokyo');
    const filter = dueTimeZoneFilter(await resolveDueTimeZones(8, NOON_UTC));
    // Not an empty `IN ()`, which Postgres rejects — an explicit "skip".
    expect(filter).toBeNull();
  });

  it('the cap now applies to the DUE cohort, not an arbitrary slice', async () => {
    // The regression, reproduced. Twelve subscribers across twelve zones and a
    // cap of two: exactly one of them is due at 08:00 local.
    //
    // The contrast query below is ordered EXPLICITLY rather than left to the
    // storage layer. The production defect relies on `selectDistinct(…).limit()`
    // being unordered, and "unordered" is not the same as "reproducible" — an
    // earlier version of this test asserted against PGlite's physical row order
    // and passed alone but failed in the full suite, because `beforeEach`
    // leaves dead tuples and later inserts reuse the freed space.
    //
    // Ordering by id models the real point precisely: ANY order that does not
    // consider dueness can put the due user outside the cap.
    const zones = [
      'Pacific/Honolulu', 'America/Anchorage', 'America/Los_Angeles', 'America/Denver',
      'America/Chicago', 'America/Halifax', 'America/Sao_Paulo', 'Atlantic/Azores',
      'Etc/UTC', 'Europe/Paris', 'Europe/Moscow', 'Asia/Tokyo',
    ];
    // `0…` sorts before `f…`, so the one due user is last in id order.
    for (const [i, z] of zones.entries()) {
      const prefix = String(i).padStart(8, '0'); // 8 hex chars, or it is not a uuid
      await subscriberWithId(`${prefix}-0000-4000-8000-000000000000`, z, 3);
    }
    await subscriberWithId('ffffffff-0000-4000-8000-000000000000', 'America/New_York', 3);

    const CAP = 2;
    const filter = dueTimeZoneFilter(await resolveDueTimeZones(8, NOON_UTC));
    expect(filter).not.toBeNull();

    // Filter first, then cap: the due user is found despite sorting last.
    const filterFirst = await testDb
      .selectDistinct({ id: schema.users.id, timezone: schema.users.timezone })
      .from(schema.users)
      .innerJoin(schema.pushSubscriptions, eq(schema.pushSubscriptions.userId, schema.users.id))
      .where(and(gt(schema.users.dailyStreak, 0), filter!))
      .orderBy(schema.users.id)
      .limit(CAP);

    expect(filterFirst).toHaveLength(1);
    expect(filterFirst[0].timezone).toBe('America/New_York');

    // Cap first, then filter: the due user never appears, at any hour, ever.
    const capFirst = await testDb
      .selectDistinct({ id: schema.users.id, timezone: schema.users.timezone })
      .from(schema.users)
      .innerJoin(schema.pushSubscriptions, eq(schema.pushSubscriptions.userId, schema.users.id))
      .where(gt(schema.users.dailyStreak, 0))
      .orderBy(schema.users.id)
      .limit(CAP);

    expect(capFirst).toHaveLength(CAP);
    expect(capFirst.map((r) => r.timezone)).not.toContain('America/New_York');
  });

  it('matches unset timezones when UTC is the due hour', async () => {
    await subscriber(null);
    await subscriber('Asia/Tokyo');

    const filter = dueTimeZoneFilter(await resolveDueTimeZones(12, NOON_UTC));
    const rows = await testDb
      .selectDistinct({ id: schema.users.id, timezone: schema.users.timezone })
      .from(schema.users)
      .innerJoin(schema.pushSubscriptions, eq(schema.pushSubscriptions.userId, schema.users.id))
      .where(filter!);

    expect(rows).toHaveLength(1);
    expect(rows[0].timezone).toBeNull();
  });
});

describe('the crons are wired to it', () => {
  it('both filter before the limit, and neither still filters the hour in JS', () => {
    const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

    for (const route of [
      'src/app/api/cron/daily-brief/route.ts',
      'src/app/api/cron/streak-reminder/route.ts',
    ]) {
      const src = read(route);
      expect(src, route).toContain('resolveDueTimeZones(');
      expect(src, route).toContain('dueTimeZoneFilter(');
      // The post-hoc hour filter is what made the cap wrong.
      expect(src, route).not.toContain('isLocalHour(u.timezone');
      expect(src, route).not.toContain('if (!isLocalHour(tz,');
    }
  });

  it('the daily brief sweeps notification_sends, which nothing used to sweep', () => {
    // Same "sweep exists, no production caller" shape the rate-limit sweep in
    // the same file was written to fix.
    const src = readFileSync(
      resolve(process.cwd(), 'src/app/api/cron/daily-brief/route.ts'),
      'utf8',
    );
    expect(src).toContain('await sweepOldNotificationSends()');
  });
});
