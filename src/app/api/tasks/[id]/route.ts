import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { tasks, goalTargets, users } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { awardCoins } from '@/lib/coins/awardCoins';
import { scopeAward, scopeAwards, utcDateKey } from '@/lib/coins/dedupeKeys';
import { taskCompleteAwards, allSubtasksCompleteAward, dailyTaskBurstAwards, firstTaskOfDayAward } from '@/lib/coins/earnRules';

function normalizeTimeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^\d{2}:\d{2}$/.test(trimmed) ? trimmed : null;
}

function normalizeRemainingFocusTime(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

function normalizeTaskStatusForDb(status: unknown): 'todo' | 'doing' | 'done' | null {
  if (status === 'todo' || status === 'doing' || status === 'done') return status;
  return null;
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** PATCH /api/tasks/[id] — update a task (ownership enforced).
 *  Note: parentTaskId and depth are immutable — not included in the patch builder.
 *  Reparenting is not supported. */
export async function PATCH(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const db = getDatabase();
    const patch: Record<string, unknown> = { updatedAt: new Date() };

    const validPriorities = ['low', 'medium', 'high'];

    if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim();
    if (typeof body.description === 'string') patch.description = body.description;
    if (typeof body.status === 'string') {
      const normalized = normalizeTaskStatusForDb(body.status);
      if (normalized) patch.status = normalized;
    }
    if (typeof body.priority === 'string' && validPriorities.includes(body.priority)) patch.priority = body.priority;
    const validDifficulties = ['easy', 'medium', 'hard'];
    if (typeof body.difficulty === 'string' && validDifficulties.includes(body.difficulty)) patch.difficulty = body.difficulty;
    if (typeof body.durationMinutes === 'number') patch.estimatedMinutes = body.durationMinutes;
    if (body.scheduledStart === null) patch.scheduledStart = null;
    else if (typeof body.scheduledStart === 'string') {
      const normalizedTime = normalizeTimeString(body.scheduledStart);
      if (normalizedTime !== null) patch.scheduledStart = normalizedTime;
    }
    if (body.scheduledEnd === null) patch.scheduledEnd = null;
    else if (typeof body.scheduledEnd === 'string') {
      const normalizedTime = normalizeTimeString(body.scheduledEnd);
      if (normalizedTime !== null) patch.scheduledEnd = normalizedTime;
    }
    if (body.remainingFocusTime === null) patch.remainingFocusTime = null;
    else if (typeof body.remainingFocusTime === 'number') {
      const normalizedRemaining = normalizeRemainingFocusTime(body.remainingFocusTime);
      if (normalizedRemaining !== null) patch.remainingFocusTime = normalizedRemaining;
    }
    if (body.dueDate === null) patch.dueDate = null;
    else if (typeof body.dueDate === 'string') {
      const ts = new Date(body.dueDate);
      if (!isNaN(ts.getTime())) patch.dueDate = ts;
    }
    if (body.linkedEventId === null) patch.linkedEventId = null;
    else if (typeof body.linkedEventId === 'string' && body.linkedEventId.trim()) {
      patch.linkedEventId = body.linkedEventId;
    }
    if (body.goalId === null) patch.goalId = null;
    else if (typeof body.goalId === 'string' && body.goalId.trim()) {
      patch.goalId = body.goalId;
    }

    // C2: capture the prior status so the completion award fires only on a real
    // not-done → done transition — re-completing (done→todo→done) must not re-award.
    let prevTaskStatus: string | undefined;
    if (patch.status === 'done') {
      const [prevT] = await db
        .select({ status: tasks.status })
        .from(tasks)
        .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
        .limit(1);
      prevTaskStatus = prevT?.status;
    }

    await db
      .update(tasks)
      .set(patch)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));

    // Goal target updates + coin awards on status change. Coin awards are
    // awaited (not fire-and-forget) so we can return newBalance — the
    // client uses it to update the badge directly. Goal target updates
    // remain fire-and-forget since they don't gate the response.
    let newBalance: number | undefined;
    if (patch.status !== undefined) {
      // ── Goal target auto-update (fire-and-forget) ─────────────────
      void (async () => {
        try {
          const allTargets = await db.select().from(goalTargets)
            .where(eq(goalTargets.type, 'task_completion'));

          for (const target of allTargets) {
            if (!target.linkedTaskIds) continue;
            let taskIds: string[];
            try { taskIds = JSON.parse(target.linkedTaskIds); } catch { continue; }
            if (!Array.isArray(taskIds) || !taskIds.includes(id)) continue;
            if (taskIds.length === 0) continue;
            const linkedTasks = await db.select({ id: tasks.id, status: tasks.status })
              .from(tasks)
              .where(sql`${tasks.id} = ANY(ARRAY[${sql.join(taskIds.map(tid => sql`${tid}::uuid`), sql`, `)}])`);
            const doneCount = linkedTasks.filter(t => t.status === 'done').length;
            await db.update(goalTargets)
              .set({ currentValue: String(doneCount), updatedAt: new Date() })
              .where(eq(goalTargets.id, target.id));
          }
        } catch (e) {
          console.error('[task PATCH goal-target fan-out]', e);
        }
      })();

      // ── Coin awards on task completion (awaited) ──────────────────
      // C2: only on a real not-done → done transition. Idempotency is also
      // enforced at the ledger (keys below) as a backstop.
      if (patch.status === 'done' && prevTaskStatus !== 'done') {
        try {
          const [taskData] = await db.select({
            difficulty: tasks.difficulty,
            dueDate: tasks.dueDate,
            parentTaskId: tasks.parentTaskId,
          }).from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId)));

          if (taskData) {
            const [u] = await db.select({ consumables: users.consumables }).from(users).where(eq(users.id, userId));
            const consumables = (u?.consumables as Record<string, number>) ?? {};
            const hasTaskMultiplier = (consumables.taskMultiplier ?? 0) > 0;

            const awards = taskCompleteAwards(
              taskData.difficulty ?? 'medium',
              taskData.dueDate?.toISOString().slice(0, 10) ?? null,
              hasTaskMultiplier,
            );

            const today = new Date();
            const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(tasks)
              .where(and(eq(tasks.userId, userId), eq(tasks.status, 'done'), sql`${tasks.updatedAt} >= ${todayStart}`));
            const completedToday = countResult?.count ?? 0;

            if (completedToday === 1) awards.push(firstTaskOfDayAward());
            awards.push(...dailyTaskBurstAwards(completedToday));

            // Task rules keyed by this task; per-day rules keyed by date (scopeAward).
            const utcDate = utcDateKey(new Date());
            const entries = scopeAwards(awards, { entityId: id, sourceType: 'task', utcDate });

            // All-subtasks bonus is keyed by the PARENT (once per parent), not this task.
            if (taskData.parentTaskId) {
              const siblings = await db.select({ status: tasks.status }).from(tasks)
                .where(and(eq(tasks.parentTaskId, taskData.parentTaskId), eq(tasks.userId, userId)));
              if (siblings.length > 0 && siblings.every(s => s.status === 'done')) {
                entries.push(scopeAward(allSubtasksCompleteAward(), {
                  entityId: taskData.parentTaskId, sourceType: 'task', utcDate,
                }));
              }
            }

            if (entries.length > 0) {
              const res = await awardCoins(userId, entries);
              newBalance = res.newBalance;
              // Consume one task-multiplier ONLY if its bonus was actually granted
              // (not a dedupe duplicate) — atomic decrement on the live JSON column.
              const multiplierGranted = res.outcomes.some(
                (o) => o.dedupeKey === `task_multiplier_2x:${id}` && o.awarded,
              );
              if (multiplierGranted) {
                await db.update(users).set({
                  consumables: sql`jsonb_set(coalesce(${users.consumables}, '{}'::jsonb), '{taskMultiplier}', to_jsonb(greatest(0, coalesce((${users.consumables}->>'taskMultiplier')::int, 0) - 1)))`,
                }).where(eq(users.id, userId));
              }
            }
          }
        } catch (e) {
          console.error('[task PATCH coin award]', e);
        }
      }
    }

    return NextResponse.json({ ok: true, newBalance });
  } catch (err) {
    console.error('[PATCH /api/tasks/[id]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE /api/tasks/[id] — delete a task (ownership enforced) */
export async function DELETE(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const db = getDatabase();
    await db
      .delete(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/tasks/[id]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
