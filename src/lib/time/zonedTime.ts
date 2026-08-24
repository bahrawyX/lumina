/**
 * Wall-clock ⇄ instant conversion, in a named IANA timezone.
 *
 * ## The bug this exists to fix
 *
 * Event times were written as floating wall-clock coerced to UTC:
 *
 *     const parsed = new Date(`${date}T${normalizedTime}:00.000Z`);   // <- always Z
 *
 * "3pm" was stored as `15:00Z` regardless of where the user was, and the
 * `events.timezone` column recorded alongside it was **read by no query, no
 * expansion and no renderer**. Display was self-consistent, so the UI looked
 * fine — but every comparison against a real instant was wrong by the user's
 * UTC offset:
 *
 *   * The reminder cron selected on `start_time` and then **re-converted** the
 *     already-local value into the user's timezone — a double shift. A UTC-5
 *     user's 3pm meeting was treated as 10am and announced at the wrong time.
 *   * Any conflict detection, external-calendar sync, or shared event inherited
 *     the corruption.
 *   * Recurrence expanded in UTC with no DST handling — masked by this same
 *     bug, and surfacing the moment storage is fixed.
 *
 * ## Why not `date-fns-tz`
 *
 * `Intl.DateTimeFormat` already carries the full IANA database in every runtime
 * this app targets (Node 18+, all evergreen browsers), and the conversion is
 * ~40 lines. Adding a dependency to a project whose lockfile already ships
 * Playwright into production was not the right trade.
 */

/** `YYYY-MM-DD`. */
export type DateString = string;
/** `HH:mm`. */
export type TimeString = string;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/** True if `timeZone` is an IANA zone this runtime recognises. */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone || timeZone.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Cache formatters — constructing an `Intl.DateTimeFormat` is comparatively
 * expensive, and expanding a recurrence rule calls this thousands of times.
 */
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Break an instant into the wall-clock fields an observer in `timeZone` sees. */
export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((p) => p.type === type)?.value ?? '0';
    return Number(value);
  };
  // `hour12: false` yields hour 24 for midnight in some ICU versions.
  const hour = get('hour') % 24;
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour,
    minute: get('minute'),
    second: get('second'),
  };
}

/** Milliseconds `timeZone` is ahead of UTC at the moment `instant`. */
export function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // `instant` truncated to whole seconds, because `formatToParts` has no ms.
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The instant at which the clock in `timeZone` reads `date` `time`.
 *
 * Two passes: guess the offset as if the wall-clock were UTC, then re-measure
 * at the resulting instant. One refinement is sufficient because zone offsets
 * change by at most a couple of hours and never twice within the correction
 * window.
 *
 * **DST edge cases**, stated rather than left implicit:
 *  - *Nonexistent* local times (the hour skipped when clocks spring forward)
 *    resolve to the instant just after the transition. The event lands at the
 *    real time closest to what the user asked for, which is what every calendar
 *    application does.
 *  - *Ambiguous* local times (the hour repeated when clocks fall back) resolve
 *    to the **first** occurrence, i.e. before the transition. Same convention.
 */
export function zonedWallClockToUtc(
  date: DateString,
  time: TimeString,
  timeZone: string,
): Date | null {
  if (!DATE_RE.test(date) || !TIME_RE.test(time)) return null;
  if (!isValidTimeZone(timeZone)) return null;

  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  if (hour > 23 || minute > 59) return null;

  const naive = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  if (Number.isNaN(naive)) return null;

  let instant = naive - timeZoneOffsetMs(new Date(naive), timeZone);
  instant = naive - timeZoneOffsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** `YYYY-MM-DD` + 1 calendar day, using UTC arithmetic on the date fields only. */
function addOneDay(date: DateString): DateString {
  const [y, m, d] = date.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/**
 * Render an instant as the `YYYY-MM-DD` / `HH:mm` an observer in `timeZone`
 * sees.
 *
 * This replaces `row.startTime.toISOString().slice(0, 10)` and `.slice(11, 16)`,
 * which read the UTC fields directly — correct only while storage was itself
 * floating UTC.
 */
export function utcToZonedWallClock(
  instant: Date,
  timeZone: string,
): { date: DateString; time: TimeString } {
  const zone = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  const p = zonedParts(instant, zone);
  return {
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`,
  };
}

/**
 * The UTC instants bounding a calendar day in `timeZone`.
 *
 * Day boundaries were computed with `new Date(y, m, d)` on a UTC Vercel
 * runtime, i.e. UTC midnight. A user in UTC-8 finishing their fifth task at 5pm
 * local (01:00 UTC next day) never got `task_burst_5`, and got `first_task_day`
 * twice in one local day.
 */
export function zonedDayBounds(
  date: DateString,
  timeZone: string,
): { start: Date; end: Date } | null {
  const start = zonedWallClockToUtc(date, '00:00', timeZone);
  if (!start) return null;
  // The end is local midnight of the NEXT CALENDAR DATE, computed from the date
  // string rather than by adding 24h to `start`.
  //
  // Adding 24h is wrong on both DST days: on a 25-hour (fall-back) day it lands
  // at 23:00 of the same local date, so re-resolving gives back `start` and the
  // day measures zero; on a 23-hour day it overshoots into the next day.
  // Incrementing the calendar date and re-resolving is correct for both, and
  // yields the true 23h / 25h span.
  const end = zonedWallClockToUtc(addOneDay(date), '00:00', timeZone);
  if (!end) return null;
  return { start, end };
}

/** `YYYY-MM-DD` for "today" in `timeZone`. */
export function zonedToday(timeZone: string, now: Date = new Date()): DateString {
  return utcToZonedWallClock(now, timeZone).date;
}
