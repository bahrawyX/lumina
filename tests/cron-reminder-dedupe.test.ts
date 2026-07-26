/**
 * Batch 8 #5 — cron event-reminder double-send (M4) regression tests.
 *
 * Exercises the REAL cron handler against an in-process Postgres (PGlite). The
 * fix replaces select→send→mark with an ATOMIC CLAIM (UPDATE … WHERE
 * reminder_sent_at IS NULL RETURNING), so overlapping/retried runs can't claim
 * the same row twice. Proves:
 *   1. Two concurrent runs send each due reminder exactly once.
 *   2. A claimed reminder is not re-sent by a later run.
 *   3. Opt-out releases the claim (never left marked-sent without a send).
 *   4. A failed push releases the claim so it retries on the next run.
 *
 * SERIALIZATION CAVEAT (TD-3): PGlite is single-connection, so Promise.all here
 * serializes. The atomic UPDATE…RETURNING claim is inherently safe under real
 * concurrency (row locks during UPDATE); this validates the claim/release LOGIC.
 * True multi-connection contention is tracked in TD-3 for Batch 9.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { randomUUID } from 'node:crypto';
import * as schema from '@/db/schema';

const DDL = `
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_preferences jsonb,
  timezone text NOT NULL DEFAULT 'UTC'
);
CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title varchar(512) NOT NULL,
  start_time timestamptz NOT NULL,
  is_all_day boolean NOT NULL DEFAULT false,
  location varchar(512),
  reminder_sent_at timestamptz
);
`;

const h = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof drizzle> }));
vi.mock('@/lib/db', () => ({ getDatabase: () => h.db }));
vi.mock('@/lib/cronAuth', () => ({ verifyCronSecret: () => true }));
vi.mock('@/lib/push/sendPushNotification', () => ({
  sendPushToUser: vi.fn(async () => {}),
}));

import { GET } from '@/app/api/cron/event-reminders/route';
import { sendPushToUser } from '@/lib/push/sendPushNotification';

let client: PGlite;

async function seedUser(
  prefs: Record<string, unknown> | null,
  timezone = 'UTC',
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO users (id, notification_preferences, timezone) VALUES ($1, $2::jsonb, $3)`,
    [id, prefs === null ? null : JSON.stringify(prefs), timezone],
  );
  return id;
}

async function seedEvent(
  userId: string,
  opts: { start?: Date; isAllDay?: boolean; location?: string | null } = {},
): Promise<string> {
  const id = randomUUID();
  const start = opts.start ?? new Date(Date.now() + 2 * 60 * 60 * 1000);
  await client.query(
    `INSERT INTO events (id, user_id, title, start_time, is_all_day, location, reminder_sent_at)
     VALUES ($1, $2, $3, $4, $5, $6, NULL)`,
    [id, userId, 'Standup', start.toISOString(), opts.isAllDay ?? false, opts.location ?? null],
  );
  return id;
}

async function reminderSentAt(id: string): Promise<string | null> {
  const r = await client.query<{ reminder_sent_at: string | null }>(
    `SELECT reminder_sent_at FROM events WHERE id = $1`,
    [id],
  );
  return r.rows[0].reminder_sent_at;
}

const req = () => new Request('http://localhost/api/cron/event-reminders');

beforeEach(async () => {
  client = new PGlite();
  await client.exec(DDL);
  h.db = drizzle(client, { schema });
  vi.mocked(sendPushToUser).mockReset();
  vi.mocked(sendPushToUser).mockResolvedValue(undefined as never);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('M4 — overlapping cron runs do not double-send reminders', () => {
  it('two concurrent runs send each due reminder exactly once', async () => {
    const uid = await seedUser({ eventReminders: true });
    const eid = await seedEvent(uid);

    await Promise.all([GET(req()), GET(req())]);

    expect(vi.mocked(sendPushToUser)).toHaveBeenCalledTimes(1);
    expect(await reminderSentAt(eid)).not.toBeNull();
  });

  it('a later run does not re-send an already-claimed reminder', async () => {
    const uid = await seedUser({ eventReminders: true });
    await seedEvent(uid);

    await GET(req());
    await GET(req());

    expect(vi.mocked(sendPushToUser)).toHaveBeenCalledTimes(1);
  });

  it('opt-out sends nothing and releases the claim', async () => {
    const uid = await seedUser({ eventReminders: false });
    const eid = await seedEvent(uid);

    await GET(req());

    expect(vi.mocked(sendPushToUser)).not.toHaveBeenCalled();
    expect(await reminderSentAt(eid)).toBeNull();
  });

  it('a failed push releases the claim so the next run retries', async () => {
    const uid = await seedUser({ eventReminders: true });
    const eid = await seedEvent(uid);

    vi.mocked(sendPushToUser).mockRejectedValueOnce(new Error('push down'));
    await GET(req());
    expect(await reminderSentAt(eid)).toBeNull(); // released after failure

    await GET(req());
    expect(vi.mocked(sendPushToUser)).toHaveBeenCalledTimes(2); // one fail + one success
    expect(await reminderSentAt(eid)).not.toBeNull();
  });

  it('does not remind all-day events', async () => {
    const uid = await seedUser({ eventReminders: true });
    await seedEvent(uid, { isAllDay: true });

    await GET(req());

    expect(vi.mocked(sendPushToUser)).not.toHaveBeenCalled();
  });
});
