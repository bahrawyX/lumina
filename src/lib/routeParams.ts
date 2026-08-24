import { z } from 'zod';

/**
 * Validate a dynamic route segment before it reaches the database.
 *
 * ## P2-1 — malformed route ids returned 500 instead of 400
 *
 * Every primary key in this schema is a `uuid`, and `params.id` went straight
 * into `eq(table.id, id)` with no shape check — so Postgres raised `22P02`
 * (invalid input syntax for type uuid) and the client got a generic 500.
 * Confirmed live:
 *
 *     PATCH /api/tasks/not-a-uuid  -> 500 {"error":"Internal server error"}
 *     GET   /api/docs/not-a-uuid   -> 500
 *
 * `zod` was already a dependency, used in four route files and never on a route
 * param.
 *
 * This matters more now that there is error tracking (P0-5): a scripted scan of
 * `/api/{tasks,docs,goals,events}/<junk>` produces 500s at will and drowns real
 * alerts.
 */

const uuidSchema = z.string().uuid();

/** The id, or `null` when it is not a UUID. */
export function parseRouteId(id: string | undefined | null): string | null {
  if (typeof id !== 'string') return null;
  const result = uuidSchema.safeParse(id);
  return result.success ? result.data : null;
}

/**
 * `events/[id]` accepts a composite `masterId:isoDate` form for a single
 * occurrence of a recurring series, so the UUID check applies to the segment
 * before the first `:`.
 */
export function parseEventRouteId(
  id: string | undefined | null,
): { masterId: string; occurrenceDate: string | null } | null {
  if (typeof id !== 'string' || !id) return null;

  const separator = id.indexOf(':');
  if (separator === -1) {
    const parsed = parseRouteId(id);
    return parsed ? { masterId: parsed, occurrenceDate: null } : null;
  }

  const masterId = parseRouteId(id.slice(0, separator));
  if (!masterId) return null;

  const occurrenceDate = id.slice(separator + 1);
  // The occurrence part is an ISO instant or a date; reject anything that is
  // not parseable rather than letting it reach a comparison.
  if (!occurrenceDate || Number.isNaN(Date.parse(occurrenceDate))) return null;

  return { masterId, occurrenceDate };
}

/** The standard 400 for a malformed id. */
export function invalidIdResponse(): Response {
  return new Response(JSON.stringify({ error: 'Invalid id' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
}
