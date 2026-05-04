import { describe, it, expect } from 'vitest';
import {
  formatFocusMinutes,
  getProgressBadge,
  computeGoalProgress,
  type Goal,
} from '@/types/goal';

// ── Progress percentage from task counts ─────────────────────────────────

describe('Goal progress calculation', () => {
  function pct(done: number, total: number): number {
    return total > 0 ? Math.round((done / total) * 100) : 0;
  }
  it('returns 0% with no tasks', () => expect(pct(0, 0)).toBe(0));
  it('returns 100% when all tasks done', () => expect(pct(3, 3)).toBe(100));
  it('returns 60% when 3 of 5 tasks done', () => expect(pct(3, 5)).toBe(60));
  it('returns 67% when 2 of 3 tasks done (rounded)', () => expect(pct(2, 3)).toBe(67));
  it('returns 50% when 1 of 2 done', () => expect(pct(1, 2)).toBe(50));
});

// ── Status badge thresholds ──────────────────────────────────────────────

describe('getProgressBadge()', () => {
  it('no badge at 0%', () => expect(getProgressBadge(0)).toBeNull());
  it('no badge at 24%', () => expect(getProgressBadge(24)).toBeNull());
  it('in-progress badge at 25%', () => expect(getProgressBadge(25)).toBe('in-progress'));
  it('in-progress badge at 75%', () => expect(getProgressBadge(75)).toBe('in-progress'));
  it('almost badge at 76%', () => expect(getProgressBadge(76)).toBe('almost'));
  it('almost badge at 99%', () => expect(getProgressBadge(99)).toBe('almost'));
  it('complete badge at 100%', () => expect(getProgressBadge(100)).toBe('complete'));
  it('complete badge at 150% (clamped semantics)', () => expect(getProgressBadge(150)).toBe('complete'));
});

// ── Focus minutes formatting ─────────────────────────────────────────────

describe('formatFocusMinutes()', () => {
  it('null when undefined', () => expect(formatFocusMinutes(undefined)).toBeNull());
  it('null when zero', () => expect(formatFocusMinutes(0)).toBeNull());
  it('null when negative', () => expect(formatFocusMinutes(-15)).toBeNull());
  it('< 60 min → "X min"', () => expect(formatFocusMinutes(45)).toBe('45 min'));
  it('exactly 60 → "1h"', () => expect(formatFocusMinutes(60)).toBe('1h'));
  it('150 → "2h 30m"', () => expect(formatFocusMinutes(150)).toBe('2h 30m'));
  it('120 → "2h"', () => expect(formatFocusMinutes(120)).toBe('2h'));
  it('59 → "59 min"', () => expect(formatFocusMinutes(59)).toBe('59 min'));
});

// ── computeGoalProgress: server-computed vs target-based ─────────────────

describe('computeGoalProgress()', () => {
  function baseGoal(extra: Partial<Goal> = {}): Goal {
    return {
      id: 'g1', title: 't', status: 'active', timeframe: 'weekly',
      startDate: '2026-05-04', endDate: '2026-05-11',
      targets: [], createdAt: '', updatedAt: '',
      ...extra,
    };
  }

  it('prefers server progress when taskCount > 0', () => {
    const g = baseGoal({ progress: 60, taskCount: 5, completedTaskCount: 3 });
    expect(computeGoalProgress(g)).toBe(60);
  });

  it('ignores server progress when taskCount is 0 (no linked tasks)', () => {
    const g = baseGoal({ progress: 60, taskCount: 0 });
    // taskCount: 0 → falls through to target-based, which is also 0 (no targets).
    expect(computeGoalProgress(g)).toBe(0);
  });

  it('falls back to target average when no server progress', () => {
    const g = baseGoal({
      targets: [
        { id: 't1', goalId: 'g1', title: '', type: 'percentage', currentValue: 100, targetValue: 100, linkedTaskIds: [], order: 0, createdAt: '', updatedAt: '' },
        { id: 't2', goalId: 'g1', title: '', type: 'percentage', currentValue: 0, targetValue: 100, linkedTaskIds: [], order: 1, createdAt: '', updatedAt: '' },
      ],
    });
    expect(computeGoalProgress(g)).toBe(50);
  });

  it('returns 0 when there are no tasks AND no targets', () => {
    expect(computeGoalProgress(baseGoal())).toBe(0);
  });
});

// ── Focus minutes attribution from a task list ───────────────────────────

describe('Focus minutes attribution', () => {
  it('sums (durationMinutes - remainingFocusTime) per task', () => {
    const tasks = [
      { durationMinutes: 30, remainingFocusTime: 10 }, // 20 focused
      { durationMinutes: 25, remainingFocusTime: 0 },  // 25
      { durationMinutes: 60, remainingFocusTime: 60 }, // 0
    ];
    const focused = tasks.reduce(
      (sum, t) => sum + ((t.durationMinutes ?? 0) - (t.remainingFocusTime ?? t.durationMinutes ?? 0)),
      0,
    );
    expect(focused).toBe(45);
  });

  it('treats null remainingFocusTime as full duration unfocused', () => {
    const tasks = [
      { durationMinutes: 30, remainingFocusTime: null },
      { durationMinutes: 30, remainingFocusTime: 0 },
    ];
    const focused = tasks.reduce(
      (sum, t) => sum + ((t.durationMinutes ?? 0) - (t.remainingFocusTime ?? t.durationMinutes ?? 0)),
      0,
    );
    // 0 (null treated as full) + 30 = 30
    expect(focused).toBe(30);
  });
});
