import { and, eq, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { eventRecurrence } from '@/db/schema';

/**
 * Anything that can issue an UPDATE: the pool client, a transaction, or the
 * PGlite instance the tests run against. Pinned to the BASE query-result HKT
 * rather than `ReturnType<typeof getDatabase>` so it is not welded to the Neon
 * driver — `Results<unknown>` and `QueryResult<unknown>` are different shapes
 * and the concrete type would reject the test driver.
 */
type UpdateExecutor = Pick<PgDatabase<PgQueryResultHKT>, 'update'>;

/**
 * Append one occurrence instant to a series' `exdates`, idempotently.
 *
 * P2-3: this was a bare `array_append`, which never dedupes. "Edit this
 * occurrence" and "delete this occurrence" both append, so repeating either on
 * the same instant grew the array without bound — and `expandRecurrence` pays
 * to scan the whole array for every generated instance, so the cost of a
 * fidgety user compounds on every calendar render.
 *
 * The `CASE` collapses the repeat to a no-op. `@>` is array containment, which
 * needs the literal cast to `text[]` to pick the right operator.
 *
 * Returns the rows it touched, so callers can tell "no such series (or not
 * yours)" apart from "appended" instead of reporting success either way.
 */
export function appendExdate(
  tx: UpdateExecutor,
  eventId: string,
  userId: string,
  instantIso: string,
) {
  return tx
    .update(eventRecurrence)
    .set({
      exdates: sql`case
          when ${eventRecurrence.exdates} @> array[${instantIso}]::text[] then ${eventRecurrence.exdates}
          else array_append(${eventRecurrence.exdates}, ${instantIso})
        end`,
      updatedAt: new Date(),
    })
    .where(and(eq(eventRecurrence.eventId, eventId), eq(eventRecurrence.userId, userId)))
    .returning({ eventId: eventRecurrence.eventId });
}
