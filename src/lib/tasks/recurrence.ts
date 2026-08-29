import 'server-only';
import { getNextOccurrences, validateRRule } from '@/lib/recurrence/rruleEngine';

/**
 * Recurring tasks, on a next-occurrence model.
 *
 * ## Why not expansion
 *
 * Events expand: one stored row projected into many virtual instances across a
 * window, because a calendar has to render a range. A task is not viewed over a
 * range — it is worked, then done. Expanding would fill the board with dozens
 * of identical future rows nobody can act on yet, and every one of them would
 * need reconciling when the rule changed.
 *
 * So a recurring task exists exactly once. Completing it spawns the next
 * occurrence and carries the rule forward. The board only ever shows work that
 * is actionable, which is what a to-do list is for, and it is what Todoist and
 * Things both settled on for the same reason.
 *
 * ## What "next" is measured from
 *
 * From the task's own due date, not from the moment it was completed.
 *
 * That distinction is the whole difference between "every Tuesday" and "seven
 * days after I last got round to it". Someone who ticks off Tuesday's task on
 * Thursday still wants the next one on Tuesday. Anchoring to completion time
 * would let a weekly chore drift through the week and eventually land on a
 * different day entirely.
 *
 * The exception is a task with no due date. There is nothing to anchor to, so
 * completion time is the only available reference — and a repeating task with
 * no due date is a weak concept anyway, which is why the UI requires one.
 */

export interface RecurringTaskSource {
  dueDate: Date | null;
  recurrenceRule: string | null;
  recurrenceEnd: Date | null;
}

export type NextOccurrence =
  | { kind: 'none'; reason: 'not-recurring' | 'series-ended' | 'invalid-rule' }
  | { kind: 'next'; dueDate: Date };

/**
 * Work out when a completed recurring task should next fall due.
 *
 * Returns a discriminated result rather than `Date | null` so a caller can tell
 * "this series has finished" from "this rule is broken" — the first is normal
 * and silent, the second is worth logging.
 */
export function nextOccurrenceFor(
  task: RecurringTaskSource,
  completedAt: Date = new Date(),
): NextOccurrence {
  if (!task.recurrenceRule) return { kind: 'none', reason: 'not-recurring' };

  const anchor = task.dueDate ?? completedAt;

  if (!validateRRule(task.recurrenceRule, anchor).ok) {
    return { kind: 'none', reason: 'invalid-rule' };
  }

  /**
   * One millisecond past the anchor, because `getNextOccurrences` is
   * INCLUSIVE of its `after` bound — it calls `ruleSet.between(after, …, true)`.
   *
   * Passing the anchor itself returns the occurrence that was just completed,
   * so finishing a task would immediately spawn a duplicate of it with an
   * identical due date. The first version of this did exactly that; the test
   * for "never returns the occurrence just completed" is what caught it.
   */
  const [next] = getNextOccurrences(
    { rrule: task.recurrenceRule, dtstart: anchor.toISOString() },
    new Date(anchor.getTime() + 1),
    1,
    0,
  );

  if (!next) return { kind: 'none', reason: 'series-ended' };

  const dueDate = new Date(next.startIso);
  if (task.recurrenceEnd && dueDate > task.recurrenceEnd) {
    return { kind: 'none', reason: 'series-ended' };
  }

  return { kind: 'next', dueDate };
}

/**
 * Fields a spawned occurrence inherits from the task that produced it.
 *
 * Everything describing the *work* carries over. Everything describing this
 * particular attempt at it does not:
 *
 * - `status` resets to `todo`, obviously.
 * - `remainingFocusTime` is progress against one attempt, not the recipe.
 * - `linkedEventId` / `linkedDocId` point at a specific calendar entry and a
 *   specific note. Copying them would attach next week's chore to last week's
 *   meeting, and `events_linked_task_uniq` would reject the second link anyway.
 * - `parentTaskId` and `depth` are dropped: a subtask's parent is the *previous*
 *   occurrence's parent, which will usually be complete. Spawning at root keeps
 *   the new task visible instead of buried under finished work.
 */
export interface SpawnedTaskFields {
  title: string;
  description: string | null;
  priority: string;
  difficulty: string;
  estimatedMinutes: number;
  goalId: string | null;
  position: number;
  recurrenceRule: string;
  recurrenceEnd: Date | null;
  recurrenceParentId: string;
  dueDate: Date;
  status: 'todo';
}

export function buildSpawnedTask(
  source: {
    id: string;
    title: string;
    description: string | null;
    priority: string;
    difficulty: string;
    estimatedMinutes: number;
    goalId: string | null;
    position: number;
    recurrenceRule: string | null;
    recurrenceEnd: Date | null;
    recurrenceParentId: string | null;
  },
  dueDate: Date,
): SpawnedTaskFields {
  return {
    title: source.title,
    description: source.description,
    priority: source.priority,
    difficulty: source.difficulty,
    estimatedMinutes: source.estimatedMinutes,
    goalId: source.goalId,
    position: source.position,
    recurrenceRule: source.recurrenceRule as string,
    recurrenceEnd: source.recurrenceEnd,
    // The whole series points at the FIRST task, not at the one immediately
    // before it. A chain of parents would mean walking N links to find the
    // series, and would break the moment someone deleted a middle occurrence.
    recurrenceParentId: source.recurrenceParentId ?? source.id,
    dueDate,
    status: 'todo',
  };
}
