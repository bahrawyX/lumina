import { and, eq, inArray, sql } from 'drizzle-orm';
import { goals, goalTargets, tasks } from '@/db/schema';
import type { getDatabase } from '@/lib/db';

type Db = ReturnType<typeof getDatabase>;

/**
 * Re-derive `currentValue` for the caller's own `task_completion` goal targets
 * that reference `changedTaskId`.
 *
 * Extracted from the `PATCH /api/tasks/[id]` handler (was a fire-and-forget IIFE
 * that wrote to `goal_targets`) so it is awaitable and testable on its own.
 *
 * Batch 5 (M14): every read and write is scoped to `userId` — the owning goals,
 * the targets under them, and the linked tasks — so it can never read or update
 * another tenant's targets, even if a target's `linkedTaskIds` references a task
 * owned by a different user.
 */
export async function syncTaskCompletionTargets(
  db: Db,
  userId: string,
  changedTaskId: string,
): Promise<void> {
  const userGoalIds = (
    await db.select({ id: goals.id }).from(goals).where(eq(goals.userId, userId))
  ).map((g) => g.id);
  if (userGoalIds.length === 0) return;

  const targets = await db
    .select()
    .from(goalTargets)
    .where(and(eq(goalTargets.type, 'task_completion'), inArray(goalTargets.goalId, userGoalIds)));

  for (const target of targets) {
    if (!target.linkedTaskIds) continue;
    let taskIds: string[];
    try {
      taskIds = JSON.parse(target.linkedTaskIds);
    } catch {
      continue;
    }
    if (!Array.isArray(taskIds) || taskIds.length === 0 || !taskIds.includes(changedTaskId)) continue;

    const linkedTasks = await db
      .select({ id: tasks.id, status: tasks.status })
      .from(tasks)
      .where(
        and(
          sql`${tasks.id} = ANY(ARRAY[${sql.join(taskIds.map((tid) => sql`${tid}::uuid`), sql`, `)}])`,
          eq(tasks.userId, userId),
        ),
      );
    const doneCount = linkedTasks.filter((t) => t.status === 'done').length;
    await db
      .update(goalTargets)
      .set({ currentValue: String(doneCount), updatedAt: new Date() })
      .where(eq(goalTargets.id, target.id));
  }
}
