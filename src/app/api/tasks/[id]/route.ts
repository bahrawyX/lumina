import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { tasks, users } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { awardCoins } from '@/lib/coins/awardCoins';
import { scopeAward, scopeAwards, utcDateKey } from '@/lib/coins/dedupeKeys';
import { userDayBounds } from '@/lib/time/userDay';
import { utcToZonedWallClock } from '@/lib/time/zonedTime';
import { taskCompleteAwards, allSubtasksCompleteAward, dailyTaskBurstAwards, firstTaskOfDayAward } from '@/lib/coins/earnRules';
import { syncTaskCompletionTargets } from '@/lib/goals/syncTaskCompletionTargets';
import { apiError, logger } from '@/lib/logger';
import { parseBody } from '@/lib/api/parseBody';
import { updateTaskSchema } from '@/lib/api/schemas';
import { checkLinkedOwnership } from '@/lib/ownership';
import { invalidIdResponse, parseRouteId } from '@/lib/routeParams';
import { buildSpawnedTask, nextOccurrenceFor } from '@/lib/tasks/recurrence';
import { validateRRule } from '@/lib/recurrence/rruleEngine';




interface RouteContext {
  params: Promise<{ id: string }>;
}

/** PATCH /api/tasks/[id] — update a task (ownership enforced).
 *  Note: parentTaskId and depth are immutable — not included in the patch builder.
 *  Reparenting is not supported. */
export async function PATCH(req: NextRequest, context: RouteContext) {
  const { id: rawId } = await context.params;
  // P2-1: every PK is a uuid and this went straight into `eq(table.id, id)`,
  // so Postgres raised 22P02 and the client got a generic 500.
  const id = parseRouteId(rawId);
  if (!id) return invalidIdResponse();
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  const parsed = await parseBody(req, updateTaskSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  try {
    const db = getDatabase();
    const patch: Record<string, unknown> = { updatedAt: new Date() };

    /**
     * `undefined` leaves the column alone; `null` clears it.
     *
     * That distinction is why this is still a hand-built patch object rather
     * than a spread of the parsed body — only the handler knows which fields
     * are clearable, and it differs per field. What changed is the failure
     * mode. Every branch here used to look like
     *
     *     const normalizedTime = normalizeTimeString(body.scheduledStart);
     *     if (normalizedTime !== null) patch.scheduledStart = normalizedTime;
     *
     * so `"25:00"` fell through to no assignment at all: the request returned
     * 200, the client kept its optimistic value, and a reload put the old time
     * back with nothing to explain it. `updateTaskSchema` turns each of those
     * into a 400 that names the field.
     */
    if (body.title !== undefined) patch.title = body.title;
    if (body.description !== undefined) patch.description = body.description;
    if (body.status !== undefined) patch.status = body.status;
    if (body.priority !== undefined) patch.priority = body.priority;
    if (body.difficulty !== undefined) patch.difficulty = body.difficulty;
    if (body.durationMinutes !== undefined) patch.estimatedMinutes = body.durationMinutes;
    if (body.scheduledStart !== undefined) patch.scheduledStart = body.scheduledStart;
    if (body.scheduledEnd !== undefined) patch.scheduledEnd = body.scheduledEnd;
    // Seconds; rounded here, as it always was.
    if (body.remainingFocusTime !== undefined) {
      patch.remainingFocusTime =
        body.remainingFocusTime === null ? null : Math.round(body.remainingFocusTime);
    }
    if (body.dueDate !== undefined) {
      patch.dueDate = body.dueDate === null ? null : new Date(body.dueDate);
    }

    /**
     * Recurrence. `null` clears the rule — that is how a series is stopped
     * without deleting the work already done — and clears the end date with
     * it, because an end date with no rule is inert.
     *
     * The split of duties is the same as everywhere else in this handler now:
     * `updateTaskSchema` establishes SHAPE (a string, a parseable date), and
     * `validateRRule` judges MEANING against the very engine calendar events
     * use, so a task cannot express a rule the rest of the app would reject —
     * no sub-daily frequencies (a CPU bomb with no productivity use), bounded
     * COUNT and INTERVAL.
     */
    if (body.recurrenceRule !== undefined) {
      if (body.recurrenceRule === null) {
        patch.recurrenceRule = null;
        patch.recurrenceEnd = null;
      } else if (body.recurrenceRule.trim()) {
        const anchor = body.dueDate ? new Date(body.dueDate) : new Date();
        const valid = validateRRule(body.recurrenceRule.trim(), anchor);
        if (!valid.ok) {
          return NextResponse.json({ error: `Invalid recurrence: ${valid.reason}` }, { status: 400 });
        }
        patch.recurrenceRule = body.recurrenceRule.trim();
      }
    }
    // After the block above, so an explicit end date beats the implicit clear.
    if (body.recurrenceEnd !== undefined) {
      patch.recurrenceEnd = body.recurrenceEnd === null ? null : new Date(body.recurrenceEnd);
    }
    // P1-4: POST /api/tasks validates every linked FK against the caller, with
    // a comment explaining that a foreign goalId would otherwise be counted
    // into another user's goal-progress aggregation. PATCH did not — so the
    // exact scenario that guard was written to prevent was reachable via
    // `PATCH /api/tasks/{myTaskId} {"goalId": "<victim-goal-uuid>"}`.
    const ownershipFailure = await checkLinkedOwnership(db, userId, {
      linkedEventId: { value: body.linkedEventId, table: 'events' },
      goalId: { value: body.goalId, table: 'goals' },
    });
    if (ownershipFailure) {
      return NextResponse.json(
        { error: `${ownershipFailure.field} not found` },
        { status: 404 },
      );
    }

    if (body.linkedEventId !== undefined) patch.linkedEventId = body.linkedEventId;
    if (body.goalId !== undefined) patch.goalId = body.goalId;
    // The handler used to ignore `order` entirely, so every reorder request was
    // a no-op. `order` is the client-side name for `tasks.position`.
    if (body.order !== undefined) patch.position = body.order;

    // C2: capture the prior status so the completion award fires only on a real
    // not-done → done transition — re-completing (done→todo→done) must not re-award.
    let prevTaskStatus: string | undefined;
    // The same read also feeds the recurrence spawn below, so completing a
    // repeating task costs one query rather than two.
    let prevTask:
      | {
          status: string;
          title: string;
          description: string | null;
          priority: string;
          difficulty: string;
          estimatedMinutes: number;
          goalId: string | null;
          position: number;
          dueDate: Date | null;
          recurrenceRule: string | null;
          recurrenceEnd: Date | null;
          recurrenceParentId: string | null;
        }
      | undefined;
    if (patch.status === 'done') {
      const [row] = await db
        .select({
          status: tasks.status,
          title: tasks.title,
          description: tasks.description,
          priority: tasks.priority,
          difficulty: tasks.difficulty,
          estimatedMinutes: tasks.estimatedMinutes,
          goalId: tasks.goalId,
          position: tasks.position,
          dueDate: tasks.dueDate,
          recurrenceRule: tasks.recurrenceRule,
          recurrenceEnd: tasks.recurrenceEnd,
          recurrenceParentId: tasks.recurrenceParentId,
        })
        .from(tasks)
        .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
        .limit(1);
      prevTask = row as typeof prevTask;
      prevTaskStatus = row?.status;
    }

    const updatedRows = await db
      .update(tasks)
      .set(patch)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
      .returning({ id: tasks.id });

    // P2-2: this issued the write and returned success unconditionally, so
    // `PATCH /api/tasks/00000000-0000-0000-0000-000000000000` answered
    // `200 {"ok":true}`. Ownership IS enforced (the write matches zero rows),
    // so it was never a security hole — but the API reported success for a
    // no-op, and the client had no way to detect a lost write.
    if (updatedRows.length === 0) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Goal target updates + coin awards on status change. Coin awards are
    // awaited (not fire-and-forget) so we can return newBalance — the
    // client uses it to update the badge directly. Goal target updates
    // remain fire-and-forget since they don't gate the response.
    let newBalance: number | undefined;
    let coinsEarned: number | undefined;
    if (patch.status !== undefined) {
      // ── Goal target auto-update (fire-and-forget) ─────────────────
      // Extracted to an awaitable, userId-scoped helper (Batch 5, M14) so the
      // fan-out is testable on its own.
      //
      // P2-4: this was `void`-ed. On Vercel the function may be frozen or
      // terminated the moment the response is returned, so under load the
      // goal-target progress write was simply lost — the task showed done and
      // the goal it fed never moved. It is awaited now; it is a bounded
      // per-task fan-out, not a background job.
      await syncTaskCompletionTargets(db, userId, id).catch((e) =>
        logger.error('unhandled', { route: 'task PATCH goal-target fan-out' }, e),);

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

            // P2-8: `toISOString().slice(0, 10)` is the UTC day, and the
            // `todayStart` below was built with `new Date(y, m, d)` — the
            // SERVER's day. Both are now the user's local calendar day.
            const day = await userDayBounds(db, userId);

            const awards = taskCompleteAwards(
              taskData.difficulty ?? 'medium',
              taskData.dueDate
                ? utcToZonedWallClock(taskData.dueDate, day.zone).date
                : null,
              day.date,
              hasTaskMultiplier,
            );

            // A user in UTC-8 finishing their fifth task at 5pm local is at
            // 01:00 UTC the next day: `task_burst_5` counted it into tomorrow
            // and never fired, while `first_task_day` fired twice in one local
            // day. Bound the count by the user's local day instead.
            const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(tasks)
              .where(and(
                eq(tasks.userId, userId),
                eq(tasks.status, 'done'),
                sql`${tasks.updatedAt} >= ${day.start}`,
                sql`${tasks.updatedAt} < ${day.end}`,
              ));
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
              // Amount actually applied (0 when every award was a dedupe duplicate)
              // — the client gates the coin toast on this so a re-completion is silent.
              coinsEarned = res.applied;
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
          logger.error('unhandled', { route: 'task PATCH coin award' }, e);
        }
      }
    }

    /**
     * Spawn the next occurrence of a repeating task.
     *
     * Gated on a real not-done -> done transition, using the same
     * `prevTaskStatus` the coin award uses: re-completing a task
     * (done -> todo -> done) must not mint a second occurrence any more than it
     * mints a second award.
     *
     * After the response's other work, and non-fatal: a task the user just
     * ticked off is completed whether or not the follow-up could be created.
     * Failing the request here would make a successful completion look broken.
     */
    let nextOccurrenceId: string | undefined;
    if (
      patch.status === 'done' &&
      prevTaskStatus !== 'done' &&
      prevTask?.recurrenceRule
    ) {
      try {
        const next = nextOccurrenceFor(prevTask);
        if (next.kind === 'next') {
          const [spawned] = await db
            .insert(tasks)
            .values({
              userId,
              ...buildSpawnedTask({ id, ...prevTask }, next.dueDate),
            } as typeof tasks.$inferInsert)
            .returning({ id: tasks.id });
          nextOccurrenceId = spawned?.id;
        } else if (next.reason === 'invalid-rule') {
          // A series that silently stops repeating is worse than a noisy one.
          logger.warn('recurring task has an unusable rule', {
            route: 'PATCH /api/tasks/[id]',
            taskId: id,
          });
        }
      } catch (err) {
        logger.error(
          'failed to spawn next occurrence',
          { route: 'PATCH /api/tasks/[id]', taskId: id },
          err,
        );
      }
    }

    return NextResponse.json({ ok: true, newBalance, coinsEarned, nextOccurrenceId });
  } catch (err) {
    return apiError('PATCH /api/tasks/[id]', err);
  }
}

/** DELETE /api/tasks/[id] — delete a task (ownership enforced) */
export async function DELETE(req: NextRequest, context: RouteContext) {
  const { id: rawId } = await context.params;
  // P2-1: every PK is a uuid and this went straight into `eq(table.id, id)`,
  // so Postgres raised 22P02 and the client got a generic 500.
  const id = parseRouteId(rawId);
  if (!id) return invalidIdResponse();
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const db = getDatabase();
    const deletedRows = await db
      .delete(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
      .returning({ id: tasks.id });

    if (deletedRows.length === 0) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError('DELETE /api/tasks/[id]', err);
  }
}
