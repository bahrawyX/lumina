import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { calendars } from '@/db/schema';

/**
 * The pool client or a transaction. Pinned to the BASE query-result HKT rather
 * than `ReturnType<typeof getDatabase>` so it is not welded to the Neon driver
 * and the regression test can hand it a real PGlite instance.
 */
type Executor = Pick<PgDatabase<PgQueryResultHKT>, 'select' | 'insert'>;

/**
 * Resolve the user's default local calendar, creating it on first use.
 *
 * P2-5: the find-then-insert this replaces was a TOCTOU. Two concurrent
 * first-use event creations both saw no primary-local calendar, both INSERTed,
 * and the loser hit the `calendars_one_primary_local_per_user` partial unique
 * index — an unhandled 23505 surfacing as a 500 on the very first event a new
 * account ever creates.
 *
 * `create-linked` was fixed for exactly this and `POST /api/events` was not, so
 * `tests/create-linked-calendar-toctou.test.ts` covered one sibling and missed
 * the other. Both call this now.
 *
 * The shape that works: make the create idempotent with ON CONFLICT DO NOTHING,
 * then ALWAYS re-select — whether we won the insert or a concurrent request
 * did, both callers resolve the same id and neither crashes.
 *
 * Returns null only if the re-select comes back empty, which should be
 * impossible and is worth a 500 rather than a silent second insert.
 */
export async function resolvePrimaryLocalCalendarId(
  db: Executor,
  userId: string,
): Promise<string | null> {
  const primaryLocal = and(
    eq(calendars.userId, userId),
    eq(calendars.provider, 'local'),
    eq(calendars.isPrimary, true),
  );

  const [existing] = await db
    .select({ id: calendars.id })
    .from(calendars)
    .where(primaryLocal)
    .limit(1);

  if (existing) return existing.id;

  await db
    .insert(calendars)
    .values({ userId, provider: 'local', name: 'My Calendar', isPrimary: true })
    // NB: onConflictDoNothing takes the partial-index predicate as `where`
    // (drizzle only wires `targetWhere` for onConflictDoUpdate); passing
    // `targetWhere` here is silently dropped and Postgres 42P10s.
    .onConflictDoNothing({
      target: calendars.userId,
      where: sql`${calendars.provider} = 'local' and ${calendars.isPrimary} = true`,
    });

  const [primary] = await db
    .select({ id: calendars.id })
    .from(calendars)
    .where(primaryLocal)
    .limit(1);

  return primary?.id ?? null;
}
