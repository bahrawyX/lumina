/**
 * Batch 3 — dedupe-key classification is what makes every coin award
 * replay-proof, so it is pure and exhaustively unit-tested here.
 */
import { describe, it, expect } from 'vitest';
import { utcDateKey, scopeAward, scopeAwards } from '@/lib/coins/dedupeKeys';

const DATE = '2026-07-18';

describe('utcDateKey', () => {
  it('returns the UTC calendar date, not local', () => {
    expect(utcDateKey(new Date('2026-07-18T23:30:00Z'))).toBe('2026-07-18');
    expect(utcDateKey(new Date('2026-07-18T00:00:00Z'))).toBe('2026-07-18');
  });
});

describe('scopeAward dedupe keys', () => {
  it('keys per-entity reasons by entityId', () => {
    expect(scopeAward({ amount: 5, reason: 'task_complete', label: 'x' }, { entityId: 't1', utcDate: DATE }).dedupeKey).toBe('task_complete:t1');
    expect(scopeAward({ amount: 100, reason: 'goal_complete', label: 'x' }, { entityId: 'g1', utcDate: DATE }).dedupeKey).toBe('goal_complete:g1');
    expect(scopeAward({ amount: 10, reason: 'long_doc', label: 'x' }, { entityId: 'd1', utcDate: DATE }).dedupeKey).toBe('long_doc:d1');
  });

  it('keys per-day reasons by UTC date (not entity)', () => {
    expect(scopeAward({ amount: 10, reason: 'daily_brief', label: 'x' }, { utcDate: DATE }).dedupeKey).toBe('daily_brief:2026-07-18');
    expect(scopeAward({ amount: 5, reason: 'first_task_day', label: 'x' }, { entityId: 't1', utcDate: DATE }).dedupeKey).toBe('first_task_day:2026-07-18');
    expect(scopeAward({ amount: 25, reason: 'task_burst_5', label: 'x' }, { utcDate: DATE }).dedupeKey).toBe('task_burst_5:2026-07-18');
    expect(scopeAward({ amount: 15, reason: 'plan_day', label: 'x' }, { utcDate: DATE }).dedupeKey).toBe('plan_day:2026-07-18');
  });

  it('keys streak milestones once-per-user (level encoded in reason)', () => {
    expect(scopeAward({ amount: 50, reason: 'daily_streak_7', label: 'x' }, { utcDate: DATE }).dedupeKey).toBe('daily_streak_7');
    expect(scopeAward({ amount: 30, reason: 'session_streak_5', label: 'x' }, { utcDate: DATE }).dedupeKey).toBe('session_streak_5');
  });

  it('fails loud rather than silently mis-keying a per-entity reason with no entityId', () => {
    expect(() => scopeAward({ amount: 5, reason: 'task_complete', label: 'x' }, { utcDate: DATE })).toThrow(/entityId/);
  });

  it('attaches provenance only when both sourceType and entityId are present', () => {
    const withProv = scopeAward({ amount: 5, reason: 'task_complete', label: 'x' }, { entityId: 't1', sourceType: 'task', utcDate: DATE });
    expect(withProv.sourceType).toBe('task');
    expect(withProv.sourceId).toBe('t1');
    const dayOnly = scopeAward({ amount: 10, reason: 'daily_brief', label: 'x' }, { utcDate: DATE });
    expect(dayOnly.sourceType).toBeUndefined();
    expect(dayOnly.sourceId).toBeUndefined();
  });

  it('produces identical keys for a re-run of the same entity (idempotent replay)', () => {
    const rules = [
      { amount: 5, reason: 'task_complete', label: 'x' },
      { amount: 8, reason: 'task_early', label: 'y' },
    ];
    const first = scopeAwards(rules, { entityId: 't1', utcDate: DATE }).map((e) => e.dedupeKey);
    const second = scopeAwards(rules, { entityId: 't1', utcDate: DATE }).map((e) => e.dedupeKey);
    expect(first).toEqual(second);
    expect(first).toEqual(['task_complete:t1', 'task_early:t1']);
  });
});
