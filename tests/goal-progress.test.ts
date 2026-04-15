/**
 * Goal progress math — pure functions from src/types/goal.ts.
 *
 * These drive every progress bar in GoalCard, GoalDetailSheet, and the
 * GoalsWidget on the dashboard. One bug here and the whole goals system
 * lies to the user.
 */
import { describe, it, expect } from 'vitest';
import {
  computeTargetProgress,
  computeGoalProgress,
  type Goal,
  type GoalTarget,
} from '@/types/goal';

const baseTarget = (overrides: Partial<GoalTarget>): GoalTarget => ({
  id: 't1',
  goalId: 'g1',
  title: 'Test target',
  type: 'number',
  currentValue: 0,
  targetValue: 100,
  linkedTaskIds: [],
  order: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

const baseGoal = (targets: GoalTarget[]): Goal => ({
  id: 'g1',
  title: 'Ship it',
  status: 'active',
  timeframe: 'monthly',
  startDate: '2026-01-01T00:00:00Z',
  endDate: '2026-01-31T00:00:00Z',
  targets,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

describe('computeTargetProgress — number type', () => {
  it('returns 0 when currentValue is 0', () => {
    expect(computeTargetProgress(baseTarget({ type: 'number', currentValue: 0, targetValue: 10 })))
      .toBe(0);
  });

  it('returns 50 at half progress', () => {
    expect(computeTargetProgress(baseTarget({ type: 'number', currentValue: 5, targetValue: 10 })))
      .toBe(50);
  });

  it('caps at 100 when overshooting', () => {
    expect(computeTargetProgress(baseTarget({ type: 'number', currentValue: 25, targetValue: 10 })))
      .toBe(100);
  });

  it('guards against divide-by-zero', () => {
    expect(computeTargetProgress(baseTarget({ type: 'number', currentValue: 5, targetValue: 0 })))
      .toBe(0);
  });
});

describe('computeTargetProgress — percentage type', () => {
  it('passes through valid percentages', () => {
    expect(computeTargetProgress(baseTarget({ type: 'percentage', currentValue: 42, targetValue: 100 })))
      .toBe(42);
  });

  it('clamps negative values to 0', () => {
    expect(computeTargetProgress(baseTarget({ type: 'percentage', currentValue: -5, targetValue: 100 })))
      .toBe(0);
  });

  it('clamps above-100 values to 100', () => {
    expect(computeTargetProgress(baseTarget({ type: 'percentage', currentValue: 150, targetValue: 100 })))
      .toBe(100);
  });
});

describe('computeTargetProgress — boolean type', () => {
  it('returns 0 when not done', () => {
    expect(computeTargetProgress(baseTarget({ type: 'boolean', currentValue: 0, targetValue: 1 })))
      .toBe(0);
  });

  it('returns 100 once flipped', () => {
    expect(computeTargetProgress(baseTarget({ type: 'boolean', currentValue: 1, targetValue: 1 })))
      .toBe(100);
  });
});

describe('computeTargetProgress — task_completion type', () => {
  it('returns 0 when no tasks linked', () => {
    expect(computeTargetProgress(baseTarget({
      type: 'task_completion',
      currentValue: 0,
      targetValue: 5,
      linkedTaskIds: [],
    }))).toBe(0);
  });

  it('returns correct ratio when some tasks done', () => {
    expect(computeTargetProgress(baseTarget({
      type: 'task_completion',
      currentValue: 2,
      targetValue: 4,
      linkedTaskIds: ['a', 'b', 'c', 'd'],
    }))).toBe(50);
  });

  it('caps at 100 even if currentValue exceeds linked tasks', () => {
    expect(computeTargetProgress(baseTarget({
      type: 'task_completion',
      currentValue: 10,
      targetValue: 3,
      linkedTaskIds: ['a', 'b', 'c'],
    }))).toBe(100);
  });
});

describe('computeGoalProgress', () => {
  it('returns 0 for a goal with no targets', () => {
    expect(computeGoalProgress(baseGoal([]))).toBe(0);
  });

  it('returns a single target’s progress for one-target goals', () => {
    const t = baseTarget({ type: 'number', currentValue: 5, targetValue: 10 });
    expect(computeGoalProgress(baseGoal([t]))).toBe(50);
  });

  it('returns the rounded average of multiple targets', () => {
    const a = baseTarget({ id: 'a', type: 'number', currentValue: 10, targetValue: 10 }); // 100
    const b = baseTarget({ id: 'b', type: 'number', currentValue: 0, targetValue: 10 });  // 0
    const c = baseTarget({ id: 'c', type: 'boolean', currentValue: 1, targetValue: 1 });  // 100
    // avg = (100 + 0 + 100) / 3 = 66.67 -> rounds to 67
    expect(computeGoalProgress(baseGoal([a, b, c]))).toBe(67);
  });

  it('handles mixed target types correctly', () => {
    const a = baseTarget({ id: 'a', type: 'percentage', currentValue: 80, targetValue: 100 });
    const b = baseTarget({
      id: 'b',
      type: 'task_completion',
      currentValue: 1,
      targetValue: 2,
      linkedTaskIds: ['x', 'y'],
    });
    // avg = (80 + 50) / 2 = 65
    expect(computeGoalProgress(baseGoal([a, b]))).toBe(65);
  });

  it('returns an integer (always rounded)', () => {
    const a = baseTarget({ id: 'a', type: 'number', currentValue: 1, targetValue: 3 });
    const b = baseTarget({ id: 'b', type: 'number', currentValue: 1, targetValue: 3 });
    const p = computeGoalProgress(baseGoal([a, b]));
    expect(Number.isInteger(p)).toBe(true);
  });
});
