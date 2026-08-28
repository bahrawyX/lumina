import 'server-only';
import { eq, isNull, or, inArray, type SQL } from 'drizzle-orm';
import { users, pushSubscriptions } from '@/db/schema';
import { getDatabase } from '@/lib/db';
import { isLocalHour } from './claim';

/**
 * Which timezones are at a given local hour right now — resolved BEFORE the
 * row limit, not after it.
 *
 * ## The bug
 *
 * Both notification crons did this:
 *
 *     const candidates = await db.selectDistinct({…})
 *       .from(users)
 *       .innerJoin(pushSubscriptions, …)
 *       .limit(MAX_USERS_PER_RUN);          // <- 500, unordered
 *
 *     const dueNow = candidates.filter((u) =>
 *       isLocalHour(u.timezone || 'UTC', HOUR, now));   // <- filter AFTER
 *
 * The hourly-cron design is right: each user should be picked up in the hour
 * that is 08:00 (or 20:00) where they live. But the cap was applied to an
 * **unordered** `selectDistinct` before anything was filtered, so past 500 push
 * subscribers the database returns an arbitrary 500 rows — and, because
 * nothing orders them, in practice the *same* arbitrary 500 every hour.
 *
 * Roughly 1/24th of that slice is due in any given hour, and the rest of the
 * user base is never in the slice at all. They are not briefed late; they are
 * never briefed, at any hour, on any day. `truncated: true` in the response
 * body was the only hint, and it reads like ordinary backpressure.
 *
 * ## The fix
 *
 * Resolve the due timezones first, then let SQL filter on them, so
 * `MAX_USERS_PER_RUN` bounds the cohort that is actually due. A run now
 * truncates only if more than 500 people share the same local hour, which is
 * real backpressure rather than silent starvation.
 *
 * Distinct zones are read from the database rather than
 * `Intl.supportedValuesOf('timeZone')`, which lists only the 418 canonical
 * names. A user whose stored zone is a legacy alias — `Asia/Calcutta`,
 * `US/Eastern`, `Europe/Kiev` — is valid input to `Intl.DateTimeFormat` and
 * absent from that list, so building the filter from the canonical set would
 * have silently dropped exactly the users hardest to notice missing.
 */

/** Timezone stored as NULL or '' is treated as UTC, matching `u.timezone || 'UTC'`. */
const FALLBACK_ZONE = 'UTC';

export interface DueZones {
  /** Explicit zone strings whose local time is currently `hour`. */
  zones: string[];
  /** True when rows with no stored timezone are due (i.e. UTC is at `hour`). */
  includeUnset: boolean;
}

/**
 * Read the distinct timezones of users who have at least one push
 * subscription, and return those currently at `hour` local time.
 *
 * The distinct set is small — bounded by how many zones your users actually
 * live in, typically dozens — so this is a cheap index-only scan, not a table
 * read.
 */
export async function resolveDueTimeZones(hour: number, now: Date): Promise<DueZones> {
  const db = getDatabase();

  const rows = await db
    .selectDistinct({ timezone: users.timezone })
    .from(users)
    .innerJoin(pushSubscriptions, eq(pushSubscriptions.userId, users.id));

  const zones: string[] = [];
  let includeUnset = false;

  for (const row of rows) {
    const tz = row.timezone;
    if (!tz) {
      // Resolved once via the fallback rather than per row.
      continue;
    }
    // `isLocalHour` falls back to UTC for a zone this runtime cannot parse —
    // deliberately, so a corrupt value still gets notified rather than never.
    // That behaviour is preserved exactly by evaluating it here.
    if (isLocalHour(tz, hour, now)) zones.push(tz);
  }

  if (rows.some((r) => !r.timezone)) {
    includeUnset = isLocalHour(FALLBACK_ZONE, hour, now);
  }

  return { zones, includeUnset };
}

/**
 * A `WHERE` fragment matching users in `due`, or `null` when nobody is due —
 * in which case the caller should skip the main query entirely rather than
 * emit `IN ()`.
 */
export function dueTimeZoneFilter(due: DueZones): SQL | null {
  const clauses: SQL[] = [];
  if (due.zones.length > 0) clauses.push(inArray(users.timezone, due.zones));
  if (due.includeUnset) {
    clauses.push(isNull(users.timezone));
    clauses.push(eq(users.timezone, ''));
  }
  if (clauses.length === 0) return null;
  return clauses.length === 1 ? clauses[0] : (or(...clauses) as SQL);
}
