import { lte, sql, type SQL } from 'drizzle-orm';
import { docs } from '@/db/schema';

/**
 * P2-6 — doc saves silently overwrote each other.
 *
 * The old shape was a SELECT of `updated_at`, a comparison in JS, and then a
 * blind UPDATE. Two concurrent saves both read the same `updated_at`, both
 * passed the comparison, and the second overwrote the first. The 409 fired only
 * for a client that was already visibly behind — never under the real
 * concurrency it exists to catch.
 *
 * The guard belongs in the write's WHERE, where Postgres evaluates it against
 * the row it is about to lock.
 *
 * Two details that are easy to get wrong, and were:
 *
 * 1. `updated_at` is `timestamptz`, which Postgres stores at MICROSECOND
 *    resolution. The client's copy arrives as an ISO string via `toISOString()`,
 *    which truncates to milliseconds — so a client echoing back the exact value
 *    it was given holds a slightly SMALLER number than the row, and a naive
 *    `updated_at <= client` would reject its own first save. Both sides are
 *    truncated to milliseconds before comparing.
 *
 * 2. Writing `updated_at` from the app server's `new Date()` makes the guard
 *    depend on the app clock. Two Vercel instances a few milliseconds apart
 *    could each write a timestamp that still satisfies the other's guard. The
 *    new value comes from the database clock instead, and is forced strictly
 *    past the current row so two saves inside the same millisecond still
 *    produce distinct, ordered values.
 */

/** Millisecond-truncated `updated_at`, the form the client can actually hold. */
const updatedAtMs = sql`date_trunc('milliseconds', ${docs.updatedAt})`;

/**
 * The WHERE fragment that makes a save conditional on the client being current.
 * Returns undefined when the client sent no usable copy, in which case the save
 * is unconditional — matching the previous behaviour for clients that do not
 * participate in conflict detection.
 */
export function docStaleGuard(clientUpdatedAt: Date | null): SQL | undefined {
  if (!clientUpdatedAt || isNaN(clientUpdatedAt.getTime())) return undefined;
  return lte(updatedAtMs, clientUpdatedAt);
}

/**
 * The next `updated_at`: the database clock, but never less than one
 * millisecond past the row's current value, so every save is strictly ordered.
 */
export function nextDocUpdatedAt(): SQL {
  return sql`greatest(date_trunc('milliseconds', now()), ${updatedAtMs} + interval '1 millisecond')`;
}
