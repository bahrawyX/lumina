/**
 * Recurring tasks.
 *
 * Events have supported recurrence from the start; tasks had none, so "water
 * the plants every Tuesday" — the most ordinary thing a to-do list is asked to
 * do — could not be expressed at all.
 *
 * The behaviour worth protecting is the anchoring rule: the next occurrence is
 * measured from the task's DUE DATE, not from when it was completed. That
 * distinction is the whole difference between "every Tuesday" and "seven days
 * after I last got round to it".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { nextOccurrenceFor, buildSpawnedTask } from '@/lib/tasks/recurrence';

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');

/** A Tuesday. */
const TUESDAY = new Date('2026-06-16T09:00:00.000Z');
const WEEKLY_TUE = 'FREQ=WEEKLY;BYDAY=TU';

describe('when the next occurrence falls', () => {
  it('repeats weekly from the due date', () => {
    const next = nextOccurrenceFor({
      dueDate: TUESDAY,
      recurrenceRule: WEEKLY_TUE,
      recurrenceEnd: null,
    });
    expect(next.kind).toBe('next');
    expect(next.kind === 'next' && next.dueDate.toISOString()).toBe('2026-06-23T09:00:00.000Z');
  });

  it('anchors to the DUE DATE even when completed late', () => {
    // The point of the whole design. Ticking Tuesday's task off on Thursday
    // still produces next Tuesday — not "a week from Thursday", which is how a
    // weekly chore drifts through the week and ends up on a different day.
    const completedThursday = new Date('2026-06-18T20:00:00.000Z');
    const next = nextOccurrenceFor(
      { dueDate: TUESDAY, recurrenceRule: WEEKLY_TUE, recurrenceEnd: null },
      completedThursday,
    );
    expect(next.kind === 'next' && next.dueDate.toISOString()).toBe('2026-06-23T09:00:00.000Z');
  });

  it('never returns the occurrence just completed', () => {
    // `after` must be exclusive, or completing a task spawns a duplicate of
    // itself in the same breath.
    const next = nextOccurrenceFor({
      dueDate: TUESDAY,
      recurrenceRule: WEEKLY_TUE,
      recurrenceEnd: null,
    });
    expect(next.kind === 'next' && next.dueDate.getTime()).toBeGreaterThan(TUESDAY.getTime());
  });

  it('falls back to completion time when there is no due date', () => {
    // Nothing to anchor to. Weak as a concept, which is why the UI asks for a
    // due date — but it must not crash or silently stop repeating.
    const completed = new Date('2026-06-18T20:00:00.000Z');
    const next = nextOccurrenceFor(
      { dueDate: null, recurrenceRule: 'FREQ=DAILY', recurrenceEnd: null },
      completed,
    );
    expect(next.kind).toBe('next');
    expect(next.kind === 'next' && next.dueDate.getTime()).toBeGreaterThan(completed.getTime());
  });
});

describe('when the series should stop', () => {
  it('stops after recurrenceEnd', () => {
    const next = nextOccurrenceFor({
      dueDate: TUESDAY,
      recurrenceRule: WEEKLY_TUE,
      recurrenceEnd: new Date('2026-06-20T00:00:00.000Z'),
    });
    expect(next).toEqual({ kind: 'none', reason: 'series-ended' });
  });

  it('stops when the rule itself runs out', () => {
    const next = nextOccurrenceFor({
      dueDate: TUESDAY,
      recurrenceRule: 'FREQ=WEEKLY;BYDAY=TU;COUNT=1',
      recurrenceEnd: null,
    });
    expect(next).toEqual({ kind: 'none', reason: 'series-ended' });
  });

  it('reports a non-recurring task distinctly from a finished series', () => {
    // Different reasons: one is normal and silent, the other is worth logging.
    expect(
      nextOccurrenceFor({ dueDate: TUESDAY, recurrenceRule: null, recurrenceEnd: null }),
    ).toEqual({ kind: 'none', reason: 'not-recurring' });
  });

  it('reports an unusable rule rather than silently not repeating', () => {
    expect(
      nextOccurrenceFor({ dueDate: TUESDAY, recurrenceRule: 'NONSENSE', recurrenceEnd: null }),
    ).toEqual({ kind: 'none', reason: 'invalid-rule' });
  });

  it('refuses sub-daily rules, like the event engine does', () => {
    // A minutely task is a CPU bomb with no productivity use.
    expect(
      nextOccurrenceFor({ dueDate: TUESDAY, recurrenceRule: 'FREQ=MINUTELY', recurrenceEnd: null }),
    ).toEqual({ kind: 'none', reason: 'invalid-rule' });
  });
});

describe('what a spawned occurrence inherits', () => {
  const source = {
    id: 'task-1',
    title: 'Water the plants',
    description: 'Both windowsills',
    priority: 'high',
    difficulty: 'easy',
    estimatedMinutes: 10,
    goalId: 'goal-1',
    position: 3,
    recurrenceRule: WEEKLY_TUE,
    recurrenceEnd: null,
    recurrenceParentId: null,
  };

  it('carries the work across and resets the attempt', () => {
    const spawned = buildSpawnedTask(source, new Date('2026-06-23T09:00:00.000Z'));
    expect(spawned.title).toBe('Water the plants');
    expect(spawned.description).toBe('Both windowsills');
    expect(spawned.priority).toBe('high');
    expect(spawned.estimatedMinutes).toBe(10);
    expect(spawned.goalId).toBe('goal-1');
    expect(spawned.status).toBe('todo');
  });

  it('does not copy links to a specific event or doc', () => {
    // Next week's chore must not attach to last week's meeting — and
    // `events_linked_task_uniq` would reject the second link anyway.
    const spawned = buildSpawnedTask(source, new Date('2026-06-23T09:00:00.000Z'));
    expect(spawned).not.toHaveProperty('linkedEventId');
    expect(spawned).not.toHaveProperty('linkedDocId');
    expect(spawned).not.toHaveProperty('remainingFocusTime');
  });

  it('points the whole series at the FIRST task, not the previous one', () => {
    // A chain of parents would mean walking N links to find the series, and
    // would break the moment someone deleted a middle occurrence.
    const first = buildSpawnedTask(source, new Date('2026-06-23T09:00:00.000Z'));
    expect(first.recurrenceParentId).toBe('task-1');

    const second = buildSpawnedTask(
      { ...source, id: 'task-2', recurrenceParentId: 'task-1' },
      new Date('2026-06-30T09:00:00.000Z'),
    );
    expect(second.recurrenceParentId).toBe('task-1');
  });

  it('carries the rule forward, or the series stops after one repeat', () => {
    const spawned = buildSpawnedTask(source, new Date('2026-06-23T09:00:00.000Z'));
    expect(spawned.recurrenceRule).toBe(WEEKLY_TUE);
  });
});

describe('the API is wired to it', () => {
  const patchRoute = read('src/app/api/tasks/[id]/route.ts');

  it('spawns only on a real not-done -> done transition', () => {
    // Re-completing (done -> todo -> done) must not mint a second occurrence,
    // for the same reason it must not mint a second coin award.
    expect(patchRoute).toContain("patch.status === 'done' &&");
    expect(patchRoute).toContain("prevTaskStatus !== 'done' &&");
  });

  it('does not fail the completion if the spawn fails', () => {
    // The task the user ticked off is done either way; failing the request
    // would make a successful completion look broken.
    const block = patchRoute.slice(patchRoute.indexOf('nextOccurrenceId'));
    expect(block).toContain('catch');
    expect(block).toContain('logger.error');
  });

  it('validates rules through the same engine events use', () => {
    expect(patchRoute).toContain('validateRRule');
    expect(read('src/app/api/tasks/route.ts')).toContain('validateRRule');
  });

  it('exposes the fields on read, or the UI cannot show a repeat badge', () => {
    expect(read('src/app/api/tasks/route.ts')).toContain('recurrenceRule: row.recurrenceRule');
  });
});

describe('the migration matches the schema', () => {
  it('declares all three columns', () => {
    const schema = read('src/db/schema/tasks.ts');
    for (const col of ['recurrenceRule', 'recurrenceEnd', 'recurrenceParentId']) {
      expect(schema, col).toContain(col);
    }
    const migration = read('drizzle/0027_recurring_tasks.sql');
    for (const col of ['recurrence_rule', 'recurrence_end', 'recurrence_parent_id']) {
      expect(migration, col).toContain(col);
    }
  });

  it('is safe on a table that already has rows', () => {
    // All three nullable with no default — adding a NOT NULL column without a
    // default to a populated table fails outright.
    const migration = read('drizzle/0027_recurring_tasks.sql');
    expect(migration).not.toMatch(/ADD COLUMN[^;]*NOT NULL/i);
  });

  it('and the catch-up script carries it too', () => {
    expect(read('scripts/catch-up-schema.sql')).toContain('recurrence_rule');
  });
});

describe('the repeat presets round-trip', () => {
  it('maps each preset to a rule and back', async () => {
    const { REPEAT_OPTIONS, rruleForPreset, presetForRrule } = await import('@/lib/tasks/repeatPresets');
    const tuesday = new Date('2026-06-16T09:00:00.000Z');
    for (const opt of REPEAT_OPTIONS) {
      const rule = rruleForPreset(opt.value, tuesday);
      expect(presetForRrule(rule), opt.value).toBe(opt.value);
    }
  });

  it('pins the weekday for "every week"', async () => {
    // A bare FREQ=WEEKLY takes its day from whatever dtstart is at expansion
    // time, so the same task can drift to a different weekday.
    const { rruleForPreset } = await import('@/lib/tasks/repeatPresets');
    expect(rruleForPreset('weekly', new Date('2026-06-16T09:00:00.000Z'))).toBe('FREQ=WEEKLY;BYDAY=TU');
  });

  it('returns null for a rule it did not write, rather than guessing', async () => {
    // Callers treat null as "custom" and leave the rule alone. Snapping it to
    // the nearest preset would silently rewrite someone schedule.
    const { presetForRrule, repeatBadgeLabel } = await import('@/lib/tasks/repeatPresets');
    expect(presetForRrule('FREQ=WEEKLY;INTERVAL=3;BYDAY=MO,TH')).toBeNull();
    expect(repeatBadgeLabel('FREQ=WEEKLY;INTERVAL=3;BYDAY=MO,TH')).toBe('Repeats');
  });

  it('shows no badge for a one-off', async () => {
    const { repeatBadgeLabel } = await import('@/lib/tasks/repeatPresets');
    expect(repeatBadgeLabel(null)).toBeNull();
  });
});
