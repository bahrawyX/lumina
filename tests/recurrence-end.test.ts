/**
 * P2-9 — user-set recurrence end dates were ignored, and nothing capped the
 * total size of an expansion response.
 *
 * `event_recurrence.recurrence_end` was written by six call sites and read by
 * ZERO. When the client sends `recurrence.until` without ALSO embedding
 * `UNTIL=` in the RRULE string — which the UI does — the end date was persisted
 * and then completely disregarded, so the series recurred forever in every
 * window the user scrolled to. The `this_and_following` split path bakes
 * `UNTIL` into the rule text, which is why the bug never showed up there.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  expandRecurrence,
  getNextOccurrences,
  isOccurrence,
} from '@/lib/recurrence/rruleEngine';

const DTSTART = '2026-03-02T15:00:00.000Z'; // a Monday
const WINDOW_START = new Date('2026-03-01T00:00:00.000Z');
const WINDOW_END = new Date('2026-04-01T00:00:00.000Z');

const daily = (until?: string | null) => ({
  rrule: 'FREQ=DAILY',
  dtstart: DTSTART,
  until,
});

const expand = (until?: string | null, zone?: string) =>
  expandRecurrence(daily(until), WINDOW_START, WINDOW_END, 3_600_000, zone);

describe('P2-9 — a stored end date clips the series', () => {
  it('recurs through the whole window when there is no end date', () => {
    // March has 31 days and DTSTART is the 2nd.
    expect(expand()).toHaveLength(30);
  });

  it('stops at the stored end date even though the RRULE has no UNTIL=', () => {
    const instances = expand('2026-03-05T15:00:00.000Z');
    expect(instances.map((i) => i.startIso)).toEqual([
      '2026-03-02T15:00:00.000Z',
      '2026-03-03T15:00:00.000Z',
      '2026-03-04T15:00:00.000Z',
      '2026-03-05T15:00:00.000Z',
    ]);
  });

  it('includes an occurrence landing exactly on the end date', () => {
    const instances = expand('2026-03-03T15:00:00.000Z');
    expect(instances.at(-1)?.startIso).toBe('2026-03-03T15:00:00.000Z');
  });

  it('returns nothing when the series ended before the window', () => {
    expect(expand('2026-01-01T00:00:00.000Z')).toEqual([]);
  });

  it('accepts a Date as well as an ISO string', () => {
    expect(expand(new Date('2026-03-04T15:00:00.000Z') as unknown as string)).toHaveLength(3);
  });

  it('degrades to "no end" on an unparseable end date', () => {
    // Six call sites wrote this column from an unvalidated
    // `new Date(body.recurrence.until)`, so junk is reachable in existing rows.
    // It must fall back to "no end", never to "ends at NaN" (which would drop
    // every occurrence and look like the event had been deleted).
    expect(expand('not-a-date')).toHaveLength(30);
  });

  it('clips the zoned expansion path too', () => {
    // The zoned path is a separate function with its own window arithmetic; a
    // fix applied to only one of them would pass every test above.
    const instances = expand('2026-03-05T15:00:00.000Z', 'America/Los_Angeles');
    expect(instances).toHaveLength(4);
    expect(instances.at(-1)?.startIso).toBe('2026-03-05T15:00:00.000Z');
  });

  it('does not let the end date extend a narrower window', () => {
    const instances = expandRecurrence(
      daily('2027-01-01T00:00:00.000Z'),
      WINDOW_START,
      new Date('2026-03-05T00:00:00.000Z'),
      3_600_000,
    );
    expect(instances.at(-1)?.startIso).toBe('2026-03-04T15:00:00.000Z');
  });
});

describe('P2-9 — the other engine entry points honour it as well', () => {
  it('getNextOccurrences stops at the end date', () => {
    const next = getNextOccurrences(
      daily('2026-03-05T15:00:00.000Z'),
      new Date('2026-03-02T00:00:00.000Z'),
      10,
      3_600_000,
    );
    expect(next).toHaveLength(4);
  });

  it('getNextOccurrences returns nothing for a series already over', () => {
    const next = getNextOccurrences(
      daily('2026-01-01T00:00:00.000Z'),
      new Date('2026-03-02T00:00:00.000Z'),
      10,
      3_600_000,
    );
    expect(next).toEqual([]);
  });

  it('isOccurrence is false past the end date and true before it', () => {
    const input = daily('2026-03-05T15:00:00.000Z');
    expect(isOccurrence(input, new Date('2026-03-04T15:00:00.000Z'))).toBe(true);
    expect(isOccurrence(input, new Date('2026-03-20T15:00:00.000Z'))).toBe(false);
  });
});

describe('P2-9 — every reader passes it, and none expands a dead series', () => {
  const read = (...parts: string[]) =>
    readFileSync(join(process.cwd(), 'src', ...parts), 'utf8');

  const READERS: Array<[string, string[]]> = [
    ['events/expand', ['app', 'api', 'events', 'expand', 'route.ts']],
    ['daily-brief', ['app', 'api', 'daily-brief', 'route.ts']],
    ['intelligence', ['app', 'api', 'intelligence', 'route.ts']],
  ];

  for (const [name, parts] of READERS) {
    it(`${name} passes recurrenceEnd into the engine`, () => {
      expect(read(...parts)).toContain('until: rec.recurrenceEnd');
    });

    it(`${name} excludes series that ended before the window`, () => {
      const src = read(...parts);
      expect(src).toContain('isNull(eventRecurrence.recurrenceEnd)');
      expect(src).toContain('gte(eventRecurrence.recurrenceEnd,');
    });
  }
});

describe('P2-9 — the expand response has an aggregate budget', () => {
  const src = readFileSync(
    join(process.cwd(), 'src', 'app', 'api', 'events', 'expand', 'route.ts'),
    'utf8',
  );

  it('caps total instances, not just per-master ones', () => {
    // MAX_INSTANCES = 500 in the engine is per master event. 200 daily series
    // over a 366-day window materialised ~73,000 objects in one response.
    expect(src).toContain('MAX_TOTAL_INSTANCES');
    expect(src.match(/MAX_TOTAL_INSTANCES/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it('reports the cut rather than silently truncating', () => {
    expect(src).toContain('truncated');
    expect(src).toContain('{ instances, truncated }');
    expect(src).toContain('logger.warn');
  });
});
