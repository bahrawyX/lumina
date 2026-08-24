import 'server-only';

import { eq } from 'drizzle-orm';
import { users } from '@/db/schema';
import { isValidTimeZone } from './zonedTime';

/** Last-resort zone. Explicit so nothing silently adopts the server's. */
export const FALLBACK_TIME_ZONE = 'UTC';

type Db = {
  select: (fields: Record<string, unknown>) => {
    from: (table: unknown) => {
      where: (cond: unknown) => { limit: (n: number) => Promise<Array<{ timezone: string | null }>> };
    };
  };
};

/**
 * Per-request memo. A single POST resolves this once, but the recurrence and
 * linked-event paths call it again for the same user within one invocation.
 */
const cache = new Map<string, { zone: string; at: number }>();
const CACHE_TTL_MS = 30_000;

/**
 * The timezone a set of wall-clock event fields should be interpreted in.
 *
 * Precedence, deliberately in this order:
 *
 *  1. **The explicit `timezone` on the request.** The client knows which zone
 *     the user was looking at when they typed "3pm".
 *  2. **`users.timezone`.** The account-level setting, and the value crons and
 *     day-boundary maths use.
 *  3. **UTC.**
 *
 * What is NOT in that list is the server's local zone. `new Date(...)` without
 * an explicit zone adopts it, which on Vercel is UTC — and treating every
 * user's wall clock as UTC is precisely the defect this replaces. Making the
 * fallback explicit means a future runtime change cannot silently reintroduce
 * it.
 *
 * An invalid value at any level is skipped rather than trusted: a client can
 * send anything, and a bad zone in this column would corrupt every instant
 * derived from it.
 */
export async function resolveEventTimeZone(
  db: unknown,
  userId: string,
  requested?: unknown,
): Promise<string> {
  if (typeof requested === 'string' && isValidTimeZone(requested.trim())) {
    return requested.trim();
  }
  return getUserTimeZone(db, userId);
}

/** `users.timezone`, validated, falling back to UTC. */
export async function getUserTimeZone(db: unknown, userId: string): Promise<string> {
  const cached = cache.get(userId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.zone;

  let zone = FALLBACK_TIME_ZONE;
  try {
    const rows = await (db as Db)
      .select({ timezone: users.timezone })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const stored = rows?.[0]?.timezone;
    if (typeof stored === 'string' && isValidTimeZone(stored)) zone = stored;
  } catch {
    // A lookup failure must not fail the write. UTC is wrong for some users but
    // it is deterministic, and the event still records which zone was assumed.
  }

  cache.set(userId, { zone, at: Date.now() });
  return zone;
}

/** Drop a memoised zone, for tests and after a preferences update. */
export function invalidateUserTimeZone(userId?: string): void {
  if (userId) cache.delete(userId);
  else cache.clear();
}
