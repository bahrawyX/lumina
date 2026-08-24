/**
 * P2-3 — multi-write operations without transactions.
 * P2-4 — fire-and-forget database writes on serverless.
 *
 * The audit's four P2-3 cases:
 *   - `POST /api/events` INSERTed the event, then validated the RRULE, so an
 *     invalid rule returned 400 with the event already committed.
 *   - Recurrence-exception creation was two unwrapped writes (insert the
 *     exception, then append the exdate), and `array_append` never dedupes.
 *   - Event PATCH updated `events` and `event_recurrence` separately.
 *   - `awardCoins` opened one transaction PER ENTRY, so a crash mid-batch
 *     committed `task_complete` and lost `first_task_day` — and because those
 *     dedupe keys are day-scoped, the lost one could never be granted later.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { and, eq } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { makeCoinTestDb, seedUser, getCoins, type CoinTestDb } from './helpers/coinTestDb';

const h = vi.hoisted(() => ({ db: null as unknown as CoinTestDb['db'] }));
vi.mock('@/lib/db', () => ({ getDatabase: () => h.db }));

import { awardCoins } from '@/lib/coins/awardCoins';
import { scopeAward } from '@/lib/coins/dedupeKeys';
import { appendExdate } from '@/lib/recurrence/exdates';

let client: CoinTestDb['client'];

beforeAll(async () => {
  const t = await makeCoinTestDb();
  h.db = t.db;
  client = t.client;
});

const award = (amount: number, entityId: string) =>
  scopeAward(
    { amount, reason: 'task_complete', label: 'Task completed' },
    { entityId, sourceType: 'task', utcDate: '2026-08-24' },
  );

describe('P2-3 — an awardCoins batch commits or rolls back as a unit', () => {
  it('applies every entry in a healthy batch', async () => {
    const uid = await seedUser(client, { coins: 0 });
    const res = await awardCoins(uid, [award(5, 'a'), award(7, 'b')]);
    expect(res.applied).toBe(12);
    expect(await getCoins(client, uid)).toBe(12);
  });

  it('rolls the EARLIER entries back when a later one fails', async () => {
    const uid = await seedUser(client, { coins: 0 });

    // `coin_transactions.dedupe_key` is varchar(200); an oversize key makes the
    // second insert fail at the database, which is the closest deterministic
    // stand-in for the audit's "crash mid-batch".
    const oversize = { ...award(9, 'b'), dedupeKey: 'x'.repeat(300) };

    await expect(awardCoins(uid, [award(5, 'a'), oversize])).rejects.toThrow();

    // Before the fix the first entry had already committed in its own
    // transaction, so the user was left holding 5 coins from a batch the
    // caller was told had failed.
    expect(await getCoins(client, uid)).toBe(0);
    const ledger = await client.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM coin_transactions WHERE user_id = $1',
      [uid],
    );
    expect(ledger.rows[0].n).toBe(0);
  });

  it('reports a duplicate without aborting the rest of the batch', async () => {
    const uid = await seedUser(client, { coins: 0 });
    const first = award(5, 'dupe-target');
    await awardCoins(uid, [first]);

    const res = await awardCoins(uid, [first, award(3, 'fresh')]);
    expect(res.outcomes[0]).toMatchObject({ awarded: false, skipped: 'duplicate' });
    expect(res.outcomes[1]).toMatchObject({ awarded: true });
    expect(await getCoins(client, uid)).toBe(8);
  });
});

describe('P2-3 — appending an exdate is idempotent', () => {
  let db: ReturnType<typeof drizzle>;
  let pg: PGlite;
  const USER = '11111111-1111-4111-8111-111111111111';
  const EVENT = '22222222-2222-4222-8222-222222222222';
  const INSTANT = '2026-08-24T15:00:00.000Z';

  beforeAll(async () => {
    pg = new PGlite();
    await pg.exec(
      'CREATE TABLE event_recurrence (' +
        'id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ' +
        'event_id uuid NOT NULL, ' +
        'user_id uuid NOT NULL, ' +
        'rrule text NOT NULL, ' +
        "exdates text[] NOT NULL DEFAULT '{}', " +
        'recurrence_end timestamptz, ' +
        'created_at timestamptz NOT NULL DEFAULT now(), ' +
        'updated_at timestamptz NOT NULL DEFAULT now());',
    );
    await pg.query(
      "INSERT INTO event_recurrence (event_id, user_id, rrule) VALUES ($1, $2, 'FREQ=DAILY')",
      [EVENT, USER],
    );
    db = drizzle(pg, { schema });
  });

  const exdates = async () => {
    const rows = await db
      .select({ exdates: schema.eventRecurrence.exdates })
      .from(schema.eventRecurrence)
      .where(
        and(
          eq(schema.eventRecurrence.eventId, EVENT),
          eq(schema.eventRecurrence.userId, USER),
        ),
      );
    return rows[0].exdates;
  };

  it('appends the first time', async () => {
    const touched = await appendExdate(db, EVENT, USER, INSTANT);
    expect(touched).toHaveLength(1);
    expect(await exdates()).toEqual([INSTANT]);
  });

  it('does not grow the array on a repeat', async () => {
    // Bare `array_append` produced the same instant three times here, and every
    // expansion paid to scan the duplicates.
    await appendExdate(db, EVENT, USER, INSTANT);
    await appendExdate(db, EVENT, USER, INSTANT);
    expect(await exdates()).toEqual([INSTANT]);
  });

  it('still appends a genuinely different occurrence', async () => {
    const other = '2026-08-25T15:00:00.000Z';
    await appendExdate(db, EVENT, USER, other);
    expect(await exdates()).toEqual([INSTANT, other]);
  });

  it('touches nothing for another user, so callers can 404', async () => {
    const stranger = '33333333-3333-4333-8333-333333333333';
    const touched = await appendExdate(db, EVENT, stranger, INSTANT);
    expect(touched).toHaveLength(0);
  });
});

describe('P2-3 / P2-4 — the write paths keep their ordering', () => {
  const read = (...parts: string[]) =>
    readFileSync(join(process.cwd(), 'src', ...parts), 'utf8');

  it('POST /api/events validates the RRULE before it inserts the event', () => {
    const src = read('app', 'api', 'events', 'route.ts');
    expect(src.indexOf('validateRRule(trimmedRrule')).toBeGreaterThan(-1);
    expect(src.indexOf('validateRRule(trimmedRrule')).toBeLessThan(
      src.indexOf('.insert(events)'),
    );
  });

  it('POST /api/events commits the event and its rule in one transaction', () => {
    const src = read('app', 'api', 'events', 'route.ts');
    expect(src).toContain('await db.transaction(async (tx) => {');
    expect(src).not.toContain('await db\n      .insert(events)');
  });

  it('events/[id] no longer issues a bare array_append', () => {
    const src = read('app', 'api', 'events', '[id]', 'route.ts');
    expect(src).not.toContain('array_append(exdates');
  });

  it('the goal-target fan-out is awaited, not voided', () => {
    const src = read('app', 'api', 'tasks', '[id]', 'route.ts');
    expect(src).not.toContain('void syncTaskCompletionTargets');
    expect(src).toContain('await syncTaskCompletionTargets');
  });

  it('the ai-docs coin award is settled before the handler returns', () => {
    const src = read('app', 'api', 'docs', 'ai-stream', 'route.ts');
    expect(src).not.toContain('void awardCoins');
    expect(src).toContain('if (awardPromise) await awardPromise;');
  });
});
