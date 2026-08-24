/**
 * P1-2 — `daily-brief` and `streak-reminder` were not idempotent.
 *
 * Neither recorded that a notification had been sent, so a Vercel retry — or a
 * re-run after a partial timeout — **re-sent to everyone**. `tag: 'daily-brief'`
 * only collapses the *display* on-device; the push is still sent and still
 * costs quota.
 *
 * `event-reminders` already did this correctly with an atomic `reminder_sent_at`
 * claim. The difference was that an event reminder has a row to claim on and a
 * daily brief does not; `notification_sends` is that row.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { randomUUID } from 'node:crypto';
import * as schema from '@/db/schema';

const DDL = `
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timezone text NOT NULL DEFAULT 'UTC'
);
CREATE TABLE IF NOT EXISTS notification_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind varchar(64) NOT NULL,
  local_date varchar(10) NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS notification_sends_user_kind_date_uniq
  ON notification_sends (user_id, kind, local_date);
`;

const client = new PGlite();
const testDb = drizzle(client, { schema });

vi.mock('@/lib/db', () => ({ getDatabase: () => testDb, db: testDb }));

let claimNotification: typeof import('@/lib/notifications/claim')['claimNotification'];
let releaseClaim: typeof import('@/lib/notifications/claim')['releaseClaim'];
let isLocalHour: typeof import('@/lib/notifications/claim')['isLocalHour'];
let sweepOldNotificationSends: typeof import('@/lib/notifications/claim')['sweepOldNotificationSends'];

let userId: string;

beforeAll(async () => {
  await client.exec(DDL);
  const mod = await import('@/lib/notifications/claim');
  claimNotification = mod.claimNotification;
  releaseClaim = mod.releaseClaim;
  isLocalHour = mod.isLocalHour;
  sweepOldNotificationSends = mod.sweepOldNotificationSends;
});

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  await client.exec('TRUNCATE notification_sends, users RESTART IDENTITY CASCADE;');
  userId = randomUUID();
  await client.query('INSERT INTO users (id) VALUES ($1)', [userId]);
});

describe('P1-2 — a notification is claimed at most once per user, kind and local day', () => {
  const now = new Date('2026-08-24T08:00:00.000Z');

  it('the first claim succeeds and the second does not', async () => {
    expect(await claimNotification(userId, 'daily_brief', 'UTC', now)).toBe(true);
    // The retry / partial-timeout re-run that used to re-send to everyone.
    expect(await claimNotification(userId, 'daily_brief', 'UTC', now)).toBe(false);
  });

  it('CONCURRENT claims resolve to exactly one winner', async () => {
    // The unique index arbitrates, not a read-then-write — so overlapping cron
    // invocations cannot both believe they won.
    const results = await Promise.all(
      Array.from({ length: 8 }, () => claimNotification(userId, 'daily_brief', 'UTC', now)),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('different kinds are independent', async () => {
    expect(await claimNotification(userId, 'daily_brief', 'UTC', now)).toBe(true);
    // A user may have the brief on and task reminders off; a failure of one
    // must not suppress the other.
    expect(await claimNotification(userId, 'tasks_due', 'UTC', now)).toBe(true);
    expect(await claimNotification(userId, 'streak_reminder', 'UTC', now)).toBe(true);
  });

  it('different users are independent', async () => {
    const other = randomUUID();
    await client.query('INSERT INTO users (id) VALUES ($1)', [other]);
    expect(await claimNotification(userId, 'daily_brief', 'UTC', now)).toBe(true);
    expect(await claimNotification(other, 'daily_brief', 'UTC', now)).toBe(true);
  });

  it('a new local day is claimable again', async () => {
    expect(await claimNotification(userId, 'daily_brief', 'UTC', now)).toBe(true);
    const tomorrow = new Date('2026-08-25T08:00:00.000Z');
    expect(await claimNotification(userId, 'daily_brief', 'UTC', tomorrow)).toBe(true);
  });

  it('the bucket is the USER\'S local day, not UTC', async () => {
    // 2026-08-24T22:00Z is already the 25th in Tokyo. If the bucket were UTC,
    // a Tokyo user could receive two briefs on one of their days.
    const lateUtc = new Date('2026-08-24T22:00:00.000Z');
    expect(await claimNotification(userId, 'daily_brief', 'Asia/Tokyo', lateUtc)).toBe(true);

    const rows = await client.query<{ local_date: string }>(
      'SELECT local_date FROM notification_sends WHERE user_id = $1',
      [userId],
    );
    expect(rows.rows[0].local_date).toBe('2026-08-25');
  });
});

describe('P1-2 — a failed send hands the claim back', () => {
  const now = new Date('2026-08-24T08:00:00.000Z');

  it('release makes the notification claimable again on the next run', async () => {
    expect(await claimNotification(userId, 'daily_brief', 'UTC', now)).toBe(true);
    expect(await claimNotification(userId, 'daily_brief', 'UTC', now)).toBe(false);

    await releaseClaim(userId, 'daily_brief', 'UTC', now);

    expect(await claimNotification(userId, 'daily_brief', 'UTC', now)).toBe(true);
  });

  it('release does not touch a different kind', async () => {
    await claimNotification(userId, 'daily_brief', 'UTC', now);
    await claimNotification(userId, 'tasks_due', 'UTC', now);

    await releaseClaim(userId, 'daily_brief', 'UTC', now);

    expect(await claimNotification(userId, 'tasks_due', 'UTC', now)).toBe(false);
  });
});

describe('P1-2 — crons fire at each user\'s LOCAL hour', () => {
  it('08:00 UTC is the brief hour for a UTC user but not a Tokyo user', () => {
    const at8Utc = new Date('2026-08-24T08:00:00.000Z');
    expect(isLocalHour('UTC', 8, at8Utc)).toBe(true);
    // The audit's example: a Tokyo user received their "morning brief" at 17:00
    // local, correctly greeted "Good evening".
    expect(isLocalHour('Asia/Tokyo', 8, at8Utc)).toBe(false);
  });

  it('Tokyo gets its 08:00 at 23:00 UTC the previous day', () => {
    expect(isLocalHour('Asia/Tokyo', 8, new Date('2026-08-23T23:00:00.000Z'))).toBe(true);
  });

  it('New York gets its 20:00 streak nudge at 00:00 UTC', () => {
    // The old fixed `0 20 * * *` UTC landed at 05:00 the NEXT day in Tokyo —
    // after the streak was already lost.
    expect(isLocalHour('America/New_York', 20, new Date('2026-08-25T00:00:00.000Z'))).toBe(true);
  });

  it('an unusable timezone falls back to UTC rather than never notifying', () => {
    expect(isLocalHour('Not/AZone', 8, new Date('2026-08-24T08:00:00.000Z'))).toBe(true);
  });
});

describe('P1-2 — claims do not accumulate forever', () => {
  it('the sweep deletes old rows and keeps recent ones', async () => {
    await client.query(
      `INSERT INTO notification_sends (user_id, kind, local_date, sent_at)
       VALUES ($1, 'daily_brief', '2020-01-01', now() - interval '90 days')`,
      [userId],
    );
    await claimNotification(userId, 'streak_reminder', 'UTC', new Date());

    const deleted = await sweepOldNotificationSends(30);
    expect(deleted).toBe(1);

    const remaining = await client.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM notification_sends',
    );
    expect(remaining.rows[0].n).toBe(1);
  });
});
