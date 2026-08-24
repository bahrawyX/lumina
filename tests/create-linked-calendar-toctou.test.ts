/**
 * Batch 8 #6 — create-linked default-calendar TOCTOU (M5) regression test.
 *
 * The find-then-insert of the primary-local calendar raced: two concurrent
 * first-use requests both saw no calendar and both INSERTed, so the second hit
 * the `calendars_one_primary_local_per_user` partial unique index and the whole
 * request 500'd. The fix makes the create idempotent (INSERT … ON CONFLICT DO
 * NOTHING against that partial index) then re-selects.
 *
 * This test reproduces the failure at the layer where it originates — a duplicate
 * primary-local INSERT — against the REAL partial unique index and the EXACT
 * drizzle onConflict call the route uses. It proves both halves: the crash is
 * real (raw duplicate throws 23505), and the guard swallows it cleanly while the
 * index still admits exactly one primary-local calendar per user.
 *
 * NOTE (TD-3): a full concurrent-route reproduction is bounded by PGlite's single
 * connection (Promise.all serializes, so the route's two INSERTs never truly
 * race). The DB-level guard test below is the faithful reproduction.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { calendars } from '@/db/schema';

const DDL = `
CREATE TABLE IF NOT EXISTS calendars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL,
  external_id varchar(255),
  name varchar(255) NOT NULL,
  color varchar(32) NOT NULL DEFAULT '#6D59E0',
  enabled boolean NOT NULL DEFAULT true,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS calendars_one_primary_local_per_user
  ON calendars (user_id) WHERE provider = 'local' AND is_primary = true;
`;

let db: ReturnType<typeof drizzle>;

const primaryLocalWhere = sql`${calendars.provider} = 'local' and ${calendars.isPrimary} = true`;

async function seedPrimaryLocal(userId: string) {
  await db
    .insert(calendars)
    .values({ userId, provider: 'local', name: 'My Calendar', isPrimary: true });
}

let client: PGlite;

// One PGlite for the file, truncated between tests. See cron-reminder-dedupe
// for why per-test instances exhaust memory.
beforeAll(async () => {
  client = new PGlite();
  await client.exec(DDL);
  db = drizzle(client, { schema });
});

afterAll(async () => {
  await client?.close();
});

beforeEach(async () => {
  await client.exec('TRUNCATE calendars RESTART IDENTITY CASCADE;');
});

describe('M5 — primary-local calendar create is race-safe', () => {
  it('a raw duplicate primary-local INSERT throws (the crash source is real)', async () => {
    const uid = randomUUID();
    await seedPrimaryLocal(uid);

    await expect(
      db
        .insert(calendars)
        .values({ userId: uid, provider: 'local', name: 'Dup', isPrimary: true }),
    ).rejects.toThrow();
  });

  it('the same INSERT with ON CONFLICT DO NOTHING is a clean no-op', async () => {
    const uid = randomUUID();
    await seedPrimaryLocal(uid);

    await expect(
      db
        .insert(calendars)
        .values({ userId: uid, provider: 'local', name: 'Dup', isPrimary: true })
        .onConflictDoNothing({ target: calendars.userId, where: primaryLocalWhere }),
    ).resolves.not.toThrow();

    const rows = await db
      .select({ id: calendars.id })
      .from(calendars)
      .where(
        and(
          eq(calendars.userId, uid),
          eq(calendars.provider, 'local'),
          eq(calendars.isPrimary, true),
        ),
      );
    expect(rows).toHaveLength(1); // still exactly one primary-local calendar
  });

  it('create-then-reselect resolves the existing id without a duplicate', async () => {
    const uid = randomUUID();

    // First use: no calendar yet → ON CONFLICT insert creates one.
    await db
      .insert(calendars)
      .values({ userId: uid, provider: 'local', name: 'My Calendar', isPrimary: true })
      .onConflictDoNothing({ target: calendars.userId, where: primaryLocalWhere });
    const [first] = await db
      .select({ id: calendars.id })
      .from(calendars)
      .where(
        and(
          eq(calendars.userId, uid),
          eq(calendars.provider, 'local'),
          eq(calendars.isPrimary, true),
        ),
      )
      .limit(1);
    expect(first?.id).toBeTruthy();

    // Second use (concurrent-first-use survivor): ON CONFLICT no-op → re-select
    // resolves the SAME id, no crash, no duplicate.
    await db
      .insert(calendars)
      .values({ userId: uid, provider: 'local', name: 'My Calendar', isPrimary: true })
      .onConflictDoNothing({ target: calendars.userId, where: primaryLocalWhere });
    const [second] = await db
      .select({ id: calendars.id })
      .from(calendars)
      .where(
        and(
          eq(calendars.userId, uid),
          eq(calendars.provider, 'local'),
          eq(calendars.isPrimary, true),
        ),
      )
      .limit(1);

    expect(second?.id).toBe(first?.id);
  });
});
