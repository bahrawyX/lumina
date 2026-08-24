/**
 * Bounds for the three list endpoints that returned every row a user has ever
 * created: `GET /api/tasks`, `GET /api/events`, `GET /api/focus-sessions`.
 *
 * P2-7: all three were unpaginated and unfiltered. A two-year power user pulled
 * tens of thousands of rows through a serverless connection on every page load,
 * and the cost grows forever because nothing in the product ever deletes them.
 *
 * Two mechanisms, in this order of preference:
 *
 * 1. **An explicit window.** `?from`/`?to` on the time-ranged endpoints, capped
 *    by `MAX_RANGE_DAYS` and REJECTED rather than truncated when too wide —
 *    matching `parseRange`, so a caller asking for five years is told no rather
 *    than silently handed one.
 * 2. **A ceiling.** `?limit`, and a hard default underneath it. This is the
 *    backstop for a caller that asks for everything, and it is deliberately set
 *    high enough that no ordinary account reaches it. When it does trip, the
 *    response carries `X-Result-Truncated: true` and the server logs it — a cut
 *    nobody can see is worse than no cut at all.
 */

/** Ceiling on rows returned by one list request when no `?limit` is given. */
export const DEFAULT_LIST_LIMIT = 2000;

/** Hard ceiling, whatever `?limit` asks for. */
export const MAX_LIST_LIMIT = 5000;

export type LimitResult =
  | { kind: 'ok'; limit: number }
  | { kind: 'error'; message: string };

/**
 * Parse `?limit`. Absent → `DEFAULT_LIST_LIMIT`. Junk or out of range → an
 * error, never a silent clamp: a client that asks for 10,000 and receives 5,000
 * with no signal renders a partial list as if it were complete.
 */
export function parseLimit(raw: string | null): LimitResult {
  if (raw === null || raw === '') return { kind: 'ok', limit: DEFAULT_LIST_LIMIT };

  // `Number('12abc')` is NaN but `parseInt` would happily return 12.
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    return { kind: 'error', message: 'limit must be a positive integer' };
  }
  if (value > MAX_LIST_LIMIT) {
    return { kind: 'error', message: `limit exceeds maximum (${MAX_LIST_LIMIT})` };
  }
  return { kind: 'ok', limit: value };
}

/**
 * Headers describing what the caller actually got back.
 *
 * `X-Result-Truncated` is the honest half of the ceiling: a client that sees it
 * knows to narrow its window instead of trusting a partial list. It is a header
 * rather than an envelope field so the response body stays a plain array and
 * existing callers keep working unchanged.
 */
export function listHeaders(returned: number, limit: number): Record<string, string> {
  const truncated = returned >= limit;
  return {
    'X-Result-Count': String(returned),
    'X-Result-Limit': String(limit),
    ...(truncated ? { 'X-Result-Truncated': 'true' } : {}),
  };
}
