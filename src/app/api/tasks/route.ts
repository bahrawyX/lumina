import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { tasks, events, docs, goals } from '@/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { apiError, logger } from '@/lib/logger';
import { parseBody } from '@/lib/api/parseBody';
import { createTaskSchema } from '@/lib/api/schemas';
import { listHeaders, parseLimit } from '@/lib/listLimits';
import { validateRRule } from '@/lib/recurrence/rruleEngine';



/** Mirrors `taskStatusEnum`; a bad `?status` is a 400, not a silent full scan. */
const TASK_STATUSES = ['todo', 'doing', 'done'] as const;
type TaskStatus = (typeof TASK_STATUSES)[number];


/** GET /api/tasks — return all tasks for the authenticated user */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  // P2-7: this returned every task the user has ever created, unpaginated.
  // `?status` narrows to one board column; `?limit` caps the rest.
  const { searchParams } = new URL(req.url);
  const limitResult = parseLimit(searchParams.get('limit'));
  if (limitResult.kind === 'error') {
    return NextResponse.json({ error: limitResult.message }, { status: 400 });
  }
  const { limit } = limitResult;

  const statusParam = searchParams.get('status');
  if (statusParam !== null && !TASK_STATUSES.includes(statusParam as TaskStatus)) {
    return NextResponse.json(
      { error: `status must be one of: ${TASK_STATUSES.join(', ')}` },
      { status: 400 },
    );
  }

  try {
    const db = getDatabase();
    const rows = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          statusParam ? eq(tasks.status, statusParam as TaskStatus) : undefined,
        ),
      )
      // `position` first so a manual reorder actually survives a reload;
      // `createdAt` breaks ties for rows that have never been dragged.
      // Matches `tasks_user_status_position_idx`.
      .orderBy(tasks.position, tasks.createdAt)
      .limit(limit);

    if (rows.length >= limit) {
      logger.warn('list truncated', { route: 'GET /api/tasks', userId, limit });
    }

    // Map DB rows to the client-side Task shape
    const mapped = rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description ?? undefined,
      status: row.status as 'todo' | 'doing' | 'done',
      dbStatus: row.status,
      priority: row.priority as 'low' | 'medium' | 'high',
      difficulty: (row.difficulty ?? 'medium') as 'easy' | 'medium' | 'hard',
      dueDate: row.dueDate ? row.dueDate.toISOString().slice(0, 10) : null,
      durationMinutes: row.estimatedMinutes,
      scheduledStart: row.scheduledStart ?? null,
      scheduledEnd: row.scheduledEnd ?? null,
      remainingFocusTime: row.remainingFocusTime ?? null,
      order: row.position,
      context: null,
      recurrenceRule: row.recurrenceRule ?? null,
      recurrenceEnd: row.recurrenceEnd ? row.recurrenceEnd.toISOString() : null,
      recurrenceParentId: row.recurrenceParentId ?? null,
      linkedEventId: row.linkedEventId ?? null,
      parentTaskId: row.parentTaskId ?? null,
      depth: row.depth ?? 0,
      goalId: row.goalId ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));

    return NextResponse.json(mapped, { headers: listHeaders(rows.length, limit) });
  } catch (err) {
    return apiError('GET /api/tasks', err);
  }
}

/** POST /api/tasks — create a new task for the authenticated user */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  // `createTaskSchema` carries what four separate blocks used to: the required
  // title, the `varchar(512)` bound (P3-2 — an over-long title reached Postgres
  // as a 22001 and came back a 500), the enum membership of status/priority/
  // difficulty, `HH:mm` on the schedule fields, and uuid-shaped foreign keys.
  const parsed = await parseBody(req, createTaskSchema);
  if (!parsed.ok) return parsed.response;
  const { title, description, status, priority, difficulty, dueDate, durationMinutes, scheduledStart, scheduledEnd, remainingFocusTime, linkedEventId, linkedDocId, parentTaskId, goalId, recurrenceRule, recurrenceEnd } = parsed.data;

  // A new task starts at the end of the column it lands in.
  const dbStatus = status ?? 'todo';

  try {
    const db = getDatabase();

    // Subtask depth validation
    let resolvedParentTaskId: string | null = null;
    let resolvedDepth = 0;

    if (parentTaskId) {
      const [parent] = await db
        .select({ id: tasks.id, depth: tasks.depth })
        .from(tasks)
        .where(and(eq(tasks.id, parentTaskId), eq(tasks.userId, userId)));

      if (!parent) {
        return NextResponse.json({ error: 'Parent task not found' }, { status: 404 });
      }
      if (parent.depth >= 2) {
        return NextResponse.json({ error: 'Maximum nesting depth reached (3 levels)' }, { status: 400 });
      }
      resolvedParentTaskId = parentTaskId;
      resolvedDepth = parent.depth + 1;
    }

    // Batch 5 (FK ownership on create): linked FKs must belong to the caller.
    // A foreign goalId in particular would otherwise be counted into that other
    // user's goal-progress aggregation.
    if (linkedEventId) {
      const [e] = await db.select({ id: events.id }).from(events)
        .where(and(eq(events.id, linkedEventId), eq(events.userId, userId))).limit(1);
      if (!e) return NextResponse.json({ error: 'linkedEventId not found' }, { status: 404 });
    }
    if (linkedDocId) {
      const [d] = await db.select({ id: docs.id }).from(docs)
        .where(and(eq(docs.id, linkedDocId), eq(docs.userId, userId))).limit(1);
      if (!d) return NextResponse.json({ error: 'linkedDocId not found' }, { status: 404 });
    }
    if (goalId) {
      const [g] = await db.select({ id: goals.id }).from(goals)
        .where(and(eq(goals.id, goalId), eq(goals.userId, userId))).limit(1);
      if (!g) return NextResponse.json({ error: 'goalId not found' }, { status: 404 });
    }

    /**
     * Recurrence, validated against the same engine events use — so a task
     * cannot express a rule the rest of the app would reject (no sub-daily
     * frequencies, bounded COUNT and INTERVAL).
     *
     * `createTaskSchema` has already established that these are a string and a
     * parseable date if present, so the `typeof` and `isNaN` guards that used
     * to wrap this are gone. What it cannot judge is whether the rule MEANS
     * anything, which is what `validateRRule` is for — shape from the schema,
     * semantics here.
     */
    let normalizedRecurrence: string | null = null;
    if (recurrenceRule?.trim()) {
      const anchor = dueDate ? new Date(dueDate) : new Date();
      const valid = validateRRule(recurrenceRule.trim(), anchor);
      if (!valid.ok) {
        return NextResponse.json({ error: `Invalid recurrence: ${valid.reason}` }, { status: 400 });
      }
      normalizedRecurrence = recurrenceRule.trim();
    }
    const normalizedRecurrenceEnd = recurrenceEnd ? new Date(recurrenceEnd) : null;

    const [row] = await db
      .insert(tasks)
      .values({
        userId,
        recurrenceRule: normalizedRecurrence,
        recurrenceEnd: normalizedRecurrenceEnd,
        title,
        description: description ?? null,
        status: dbStatus,
        priority: priority ?? 'medium',
        difficulty: difficulty ?? 'medium',
        dueDate: dueDate ? new Date(dueDate) : null,
        estimatedMinutes: durationMinutes ?? 30,
        scheduledStart: scheduledStart ?? null,
        scheduledEnd: scheduledEnd ?? null,
        // Seconds, and rounded here as it always was — see the note on the
        // schema field for why it is not forced to an integer upstream.
        remainingFocusTime: remainingFocusTime == null ? null : Math.round(remainingFocusTime),
        linkedEventId: linkedEventId ?? null,
        linkedDocId: linkedDocId ?? null,
        parentTaskId: resolvedParentTaskId,
        depth: resolvedDepth,
        goalId: goalId ?? null,
        // Land a new task at the end of its column rather than sharing
        // position 0 with everything else. Computed in SQL so two concurrent
        // creates cannot read the same max.
        position: sql`coalesce((
          select max(t2.position) + 1 from ${tasks} t2
          where t2.user_id = ${userId} and t2.status = ${dbStatus}
        ), 0)`,
      })
      .returning({ id: tasks.id });

    return NextResponse.json({ id: row.id }, { status: 201 });
  } catch (err) {
    return apiError('POST /api/tasks', err);
  }
}
