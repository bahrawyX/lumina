/**
 * H5 regression:
 *  1. The RRULE validation guard rejects pathological rules before they are
 *     stored (POST /api/events/create-linked now applies validateRRule, the
 *     same guard as POST /api/events).
 *  2. The expansion site hard-caps generated occurrences at MAX_INSTANCES, so a
 *     wide expansion window can never materialise an unbounded array.
 */
import { describe, it, expect } from 'vitest';
import { validateRRule, expandRecurrence } from '@/lib/recurrence/rruleEngine';

const MAX_INSTANCES = 500;

describe('H5 — RRULE validation guard', () => {
  it('accepts a sane weekly rule', () => {
    expect(validateRRule('FREQ=WEEKLY;BYDAY=MO,WE,FR', new Date('2026-01-01T00:00:00Z')))
      .toEqual({ ok: true });
  });

  it('rejects sub-daily frequencies (CPU-bomb surface)', () => {
    const r = validateRRule('FREQ=HOURLY', new Date('2026-01-01T00:00:00Z'));
    expect(r.ok).toBe(false);
  });

  it('rejects an enormous COUNT', () => {
    const r = validateRRule('FREQ=DAILY;COUNT=1000000', new Date('2026-01-01T00:00:00Z'));
    expect(r.ok).toBe(false);
  });

  it('rejects malformed syntax', () => {
    const r = validateRRule('FREQ=NONSENSE;;;', new Date('2026-01-01T00:00:00Z'));
    expect(r.ok).toBe(false);
  });
});

describe('H5 — expansion is hard-capped at MAX_INSTANCES', () => {
  it('a DAILY rule over a 15-year window yields at most MAX_INSTANCES', () => {
    const instances = expandRecurrence(
      { rrule: 'FREQ=DAILY', dtstart: '2020-01-01T00:00:00Z' },
      new Date('2020-01-01T00:00:00Z'),
      new Date('2035-01-01T00:00:00Z'), // ~5478 daily occurrences if uncapped
      3_600_000,
    );
    expect(instances.length).toBeLessThanOrEqual(MAX_INSTANCES);
    expect(instances.length).toBe(MAX_INSTANCES);
  });

  it('a short window returns only the real occurrences (cap does not inflate)', () => {
    const instances = expandRecurrence(
      { rrule: 'FREQ=DAILY', dtstart: '2026-01-01T00:00:00Z' },
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-06T00:00:00Z'), // inclusive both ends → 6 days
      3_600_000,
    );
    expect(instances.length).toBe(6);
  });
});
