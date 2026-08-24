import { RRule, RRuleSet, rrulestr } from 'rrule';
import { utcToZonedWallClock, zonedWallClockToUtc } from '@/lib/time/zonedTime';

export interface RecurrenceInput {
  /** RFC 5545 RRULE string, e.g. "FREQ=WEEKLY;BYDAY=MO,WE,FR" */
  rrule: string;
  /** ISO start of the master event (DTSTART) */
  dtstart: string;
  /** ISO dates to exclude (EXDATE) */
  exdates?: string[];
}

export interface ExpandedInstance {
  /** ISO start of this occurrence */
  startIso: string;
  /** ISO end of this occurrence */
  endIso: string;
  /** Whether this is an exception (modified instance) */
  isException: boolean;
}

const MAX_INSTANCES = 500;

/**
 * Validate an RRULE string before it is stored. This is a safety check to
 * prevent denial-of-service via pathological rules (e.g. FREQ=SECONDLY with
 * no UNTIL/COUNT, or absurdly large COUNT values) that would blow up CPU
 * every time the engine expands them.
 *
 * Returns { ok: true } on success, or { ok: false, reason } on rejection.
 */
export function validateRRule(
  rruleStr: string,
  dtstart: Date,
): { ok: true } | { ok: false; reason: string } {
  if (typeof rruleStr !== 'string' || rruleStr.length === 0) {
    return { ok: false, reason: 'RRULE must be a non-empty string' };
  }
  if (rruleStr.length > 500) {
    return { ok: false, reason: 'RRULE exceeds max length (500)' };
  }

  let rule: RRule;
  try {
    rule = parseRRule(rruleStr, dtstart);
  } catch {
    return { ok: false, reason: 'Invalid RRULE syntax' };
  }

  const opts = rule.options;

  // Disallow sub-daily frequencies entirely — they have no productivity use
  // case and are the easiest way to construct a CPU bomb.
  // RRule FREQ numeric values: YEARLY=0 MONTHLY=1 WEEKLY=2 DAILY=3
  // HOURLY=4 MINUTELY=5 SECONDLY=6
  if (opts.freq >= 4) {
    return { ok: false, reason: 'Sub-daily frequencies are not allowed' };
  }

  // Cap explicit COUNT to something reasonable. 500 aligns with MAX_INSTANCES.
  if (opts.count && opts.count > MAX_INSTANCES) {
    return { ok: false, reason: `COUNT exceeds maximum (${MAX_INSTANCES})` };
  }

  // If neither COUNT nor UNTIL is set, that's fine — we always window-clip
  // on expansion. But guard against absurdly large INTERVALs.
  if (opts.interval && opts.interval > 1000) {
    return { ok: false, reason: 'INTERVAL exceeds maximum (1000)' };
  }

  return { ok: true };
}

/**
 * Parse an RRULE string into an RRule object anchored to the given dtstart.
 */
export function parseRRule(rruleStr: string, dtstart: Date): RRule {
  // If the string already contains DTSTART, parse as-is
  if (rruleStr.includes('DTSTART')) {
    return rrulestr(rruleStr) as RRule;
  }
  // Otherwise, parse the RRULE and anchor it
  const options = RRule.parseString(rruleStr);
  options.dtstart = dtstart;
  return new RRule(options);
}

/**
 * Expand a recurring event into individual instances within a date range.
 *
 * @param input - The recurrence rule, start time, and excluded dates
 * @param rangeStart - Start of the expansion window (inclusive)
 * @param rangeEnd - End of the expansion window (exclusive)
 * @param durationMs - Duration of each instance in milliseconds
 * @returns Array of expanded instances
 */
export function expandRecurrence(
  input: RecurrenceInput,
  rangeStart: Date,
  rangeEnd: Date,
  durationMs: number,
  /**
   * The event's IANA timezone. When given, the rule expands against LOCAL wall
   * clock so a 3pm daily event stays at 3pm across a DST transition. Omit (or
   * pass 'UTC') to expand in UTC, which is what every caller did implicitly
   * before instants were stored correctly.
   */
  timeZone?: string,
): ExpandedInstance[] {
  if (timeZone && timeZone !== 'UTC') {
    return expandRecurrenceZoned(input, rangeStart, rangeEnd, durationMs, timeZone);
  }

  const dtstart = new Date(input.dtstart);
  const rule = parseRRule(input.rrule, dtstart);

  const ruleSet = new RRuleSet();
  ruleSet.rrule(rule);

  // Add excluded dates
  if (input.exdates) {
    for (const exdate of input.exdates) {
      ruleSet.exdate(new Date(exdate));
    }
  }

  // H5: hard-cap generation via the iterator callback (returns false to stop),
  // so a wide expansion window can never materialise more than MAX_INSTANCES
  // occurrences in memory — not merely slice the output afterwards. `len` is the
  // count AFTER the current date is collected, so `len < MAX_INSTANCES` yields
  // at most MAX_INSTANCES dates. The slice below is a redundant safety net.
  const occurrences = ruleSet.between(
    rangeStart,
    rangeEnd,
    true,
    (_date, len) => len < MAX_INSTANCES,
  );

  return occurrences.slice(0, MAX_INSTANCES).map((date) => ({
    startIso: date.toISOString(),
    endIso: new Date(date.getTime() + durationMs).toISOString(),
    isException: false,
  }));
}

/**
 * Expand against the event's LOCAL wall clock, then re-anchor each occurrence
 * to a real instant.
 *
 * `rrule` has no timezone support: it works on `Date` objects and steps in UTC.
 * Once event times are stored as true instants (P0-6), a daily 3pm New York
 * event has DTSTART 19:00Z, and a naive UTC expansion emits 19:00Z every day —
 * which is 3pm in summer and **2pm in winter**. The event drifts an hour every
 * DST transition.
 *
 * The fix is the standard one:
 *
 *   1. Project DTSTART and the query window into "floating" local time — the
 *      wall-clock fields, carried in a Date as if they were UTC.
 *   2. Let `rrule` step through that floating space, where "every day at 15:00"
 *      genuinely means 15:00 each day.
 *   3. Convert each floating occurrence back to an instant in `timeZone`,
 *      picking up whatever offset applies on that date.
 *
 * Duration is applied in real time, so a 1-hour meeting stays 1 hour even when
 * it straddles a transition.
 */
function expandRecurrenceZoned(
  input: RecurrenceInput,
  rangeStart: Date,
  rangeEnd: Date,
  durationMs: number,
  timeZone: string,
): ExpandedInstance[] {
  const toFloating = (instant: Date): Date => {
    const { date, time } = utcToZonedWallClock(instant, timeZone);
    const [y, m, d] = date.split('-').map(Number);
    const [hh, mm] = time.split(':').map(Number);
    return new Date(Date.UTC(y, m - 1, d, hh, mm, 0, 0));
  };

  const floatingDtstart = toFloating(new Date(input.dtstart));
  const rule = parseRRule(input.rrule, floatingDtstart);

  const ruleSet = new RRuleSet();
  ruleSet.rrule(rule);
  if (input.exdates) {
    for (const exdate of input.exdates) {
      ruleSet.exdate(toFloating(new Date(exdate)));
    }
  }

  // Widen the floating window by a day at each edge: an occurrence just outside
  // the floating range can fall inside the real one once the offset is applied.
  const DAY = 24 * 60 * 60 * 1000;
  const occurrences = ruleSet.between(
    new Date(toFloating(rangeStart).getTime() - DAY),
    new Date(toFloating(rangeEnd).getTime() + DAY),
    true,
    (_date, len) => len < MAX_INSTANCES,
  );

  const instances: ExpandedInstance[] = [];
  for (const floating of occurrences) {
    if (instances.length >= MAX_INSTANCES) break;

    const date = `${floating.getUTCFullYear()}-${String(floating.getUTCMonth() + 1).padStart(2, '0')}-${String(floating.getUTCDate()).padStart(2, '0')}`;
    const time = `${String(floating.getUTCHours()).padStart(2, '0')}:${String(floating.getUTCMinutes()).padStart(2, '0')}`;
    const start = zonedWallClockToUtc(date, time, timeZone);
    if (!start) continue;

    // Re-clip against the REAL window, since the floating one was widened.
    if (start < rangeStart || start > rangeEnd) continue;

    instances.push({
      startIso: start.toISOString(),
      endIso: new Date(start.getTime() + durationMs).toISOString(),
      isException: false,
    });
  }
  return instances;
}

/**
 * Get the next N occurrences of a recurring event from a given point.
 */
export function getNextOccurrences(
  input: RecurrenceInput,
  after: Date,
  count: number,
  durationMs: number,
): ExpandedInstance[] {
  const dtstart = new Date(input.dtstart);
  const rule = parseRRule(input.rrule, dtstart);

  const ruleSet = new RRuleSet();
  ruleSet.rrule(rule);

  if (input.exdates) {
    for (const exdate of input.exdates) {
      ruleSet.exdate(new Date(exdate));
    }
  }

  // Use a far-future end date and limit by count. H5: same generation-time hard
  // cap — stop as soon as we have enough, bounded by MAX_INSTANCES even if the
  // caller asks for more, so a far-future window can't blow up CPU.
  const farFuture = new Date(after.getTime() + 365 * 86_400_000 * 2);
  const limit = Math.min(count, MAX_INSTANCES);
  const occurrences = ruleSet.between(after, farFuture, true, (_date, len) => len < limit);

  return occurrences.slice(0, count).map((date) => ({
    startIso: date.toISOString(),
    endIso: new Date(date.getTime() + durationMs).toISOString(),
    isException: false,
  }));
}

/**
 * Build an RRULE string from user-friendly parameters.
 */
export function buildRRule(params: {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval?: number;
  byDay?: string[];
  byMonthDay?: number[];
  byMonth?: number[];
  count?: number;
  until?: string;
}): string {
  const freqMap: Record<string, number> = {
    daily: RRule.DAILY,
    weekly: RRule.WEEKLY,
    monthly: RRule.MONTHLY,
    yearly: RRule.YEARLY,
  };

  const dayMap: Record<string, { weekday: number }> = {
    MO: RRule.MO,
    TU: RRule.TU,
    WE: RRule.WE,
    TH: RRule.TH,
    FR: RRule.FR,
    SA: RRule.SA,
    SU: RRule.SU,
  };

  const options: Partial<ConstructorParameters<typeof RRule>[0]> = {
    freq: freqMap[params.freq],
    interval: params.interval ?? 1,
  };

  if (params.byDay?.length) {
    options.byweekday = params.byDay.map((d) => dayMap[d]).filter(Boolean) as unknown as number[];
  }

  if (params.byMonthDay?.length) {
    options.bymonthday = params.byMonthDay;
  }

  if (params.byMonth?.length) {
    options.bymonth = params.byMonth;
  }

  if (params.count) {
    options.count = params.count;
  }

  if (params.until) {
    options.until = new Date(params.until);
  }

  const rule = new RRule(options as ConstructorParameters<typeof RRule>[0]);
  // Return just the RRULE part without DTSTART
  return rule.toString().replace(/^DTSTART:[^\n]*\n/, '');
}

/**
 * Get a human-readable description of an RRULE.
 */
export function describeRRule(rruleStr: string, dtstart: Date): string {
  try {
    const rule = parseRRule(rruleStr, dtstart);
    return rule.toText();
  } catch {
    return 'Custom recurrence';
  }
}

/**
 * Check if a specific date is an occurrence of the recurrence rule.
 */
export function isOccurrence(
  input: RecurrenceInput,
  date: Date,
): boolean {
  const dtstart = new Date(input.dtstart);
  const rule = parseRRule(input.rrule, dtstart);

  const ruleSet = new RRuleSet();
  ruleSet.rrule(rule);

  if (input.exdates) {
    for (const exdate of input.exdates) {
      ruleSet.exdate(new Date(exdate));
    }
  }

  // Check a small window around the target date
  const windowStart = new Date(date.getTime() - 1000);
  const windowEnd = new Date(date.getTime() + 1000);
  const occurrences = ruleSet.between(windowStart, windowEnd, true);
  return occurrences.length > 0;
}
