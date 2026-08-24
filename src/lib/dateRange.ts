/**
 * Shared clamp for caller-supplied `start` / `end` ranges.
 *
 * ## P1-10 — the range was uncapped on the expensive routes
 *
 * `GET /api/intelligence` reads the caller's **entire** tasks table unfiltered,
 * 30 days of focus sessions, all recurrence rows, then makes live paginated
 * Google *and* Microsoft Calendar calls and CPU-expands every recurrence rule.
 * It accepted any parseable ISO pair. The sync routes are the same shape:
 * `?start=1970-01-01&end=2100-01-01` triggers a fully paginated fetch of every
 * calendar, with `maxDuration = 60` and no limiter.
 *
 * Because the OAuth client is shared, **one account could exhaust the
 * Google/Graph API quota for every user of the app.**
 *
 * `/api/events/expand` already implemented exactly this clamp (a 366-day cap) —
 * the pattern existed, it just was not applied here. This lifts it out so there
 * is one implementation rather than three.
 */

/** Longest window any route will serve. Matches `/api/events/expand`. */
export const MAX_RANGE_DAYS = 366;

/** Longest window for routes that hit an external provider per request. */
export const MAX_PROVIDER_RANGE_DAYS = 92;

const DAY_MS = 24 * 60 * 60 * 1000;

export type RangeResult =
  | { kind: 'ok'; start: Date; end: Date }
  | { kind: 'error'; message: string };

/**
 * Parse and clamp a range.
 *
 * Deliberately **rejects** an over-long window rather than silently truncating
 * it: a caller asking for five years and getting one back, with no indication,
 * produces a UI that quietly shows incomplete data. `/api/events/expand`
 * already made that choice; this keeps it.
 */
export function parseRange(
  startParam: string | null,
  endParam: string | null,
  options: { defaultStart: Date; defaultEnd: Date; maxDays?: number },
): RangeResult {
  const maxDays = options.maxDays ?? MAX_RANGE_DAYS;

  const start = startParam ? new Date(startParam) : options.defaultStart;
  const end = endParam ? new Date(endParam) : options.defaultEnd;

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { kind: 'error', message: 'Invalid date format' };
  }
  if (end.getTime() <= start.getTime()) {
    return { kind: 'error', message: 'end must be after start' };
  }

  const days = (end.getTime() - start.getTime()) / DAY_MS;
  if (days > maxDays) {
    return {
      kind: 'error',
      message: `Window too large. Maximum ${maxDays} days per request.`,
    };
  }

  return { kind: 'ok', start, end };
}
