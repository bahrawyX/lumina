import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { tasks, events, docs, goals } from '@/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { checkFieldLengths, FIELD_LIMITS } from '@/lib/fieldLimits';
import { listHeaders, parseLimit } from '@/lib/listLimits';

function normalizeTimeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^\d{2}:\d{2}$/.test(trimmed) ? trimmed : null;
}

function normalizeRemainingFocusTime(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

/** Mirrors `taskStatusEnum`; a bad `?status` is a 400, not a silent full scan. */
const TASK_STATUSES = ['todo', 'doing', 'done'] as const;
type TaskStatus = (typeof TASK_STATUSES)[number];

function normalizeTaskStatusForDb(status: unknown): 'todo' | 'doing' | 'done' {
  if (status === 'doing' || status === 'done') return status;
  return 'todo';
}

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
    const mapped = rows.map((row, index) => ({
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
      linkedEventId: row.linkedEventId ?? null,
      parentTaskId: row.parentTaskId ?? null,
      depth: row.depth ?? 0,
      goalId: row.goalId ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));

    return NextResponse.json(mapped, { headers: listHeaders(rows.length, limit) });
  } catch (err) {
    logger.error('unhandled', { route: 'GET /api/tasks' }, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST /api/tasks — create a new task for the authenticated user */
export async function POST(req: NextRequest) {
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

  const { title, description, status, priority, difficulty, dueDate, durationMinutes, scheduledStart, scheduledEnd, remainingFocusTime, linkedEventId, linkedDocId, parentTaskId, goalId } = body as {
    title?: string;
    description?: string;
    status?: string;
    priority?: string;
    difficulty?: string;
    dueDate?: string | null;
    durationMinutes?: number;
    scheduledStart?: string | null;
    scheduledEnd?: string | null;
    remainingFocusTime?: number | null;
    linkedEventId?: string | null;
    linkedDocId?: string | null;
    parentTaskId?: string | null;
    goalId?: string | null;
  };

  if (!title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  // P3-2: unbounded. A 100,000-character title went straight into
  // `varchar(512)` and Postgres raised 22001, so the client got a 500 for a
  // request it simply got wrong.
  const tooLong = checkFieldLengths({
    title: { value: title, max: FIELD_LIMITS.title },
    description: { value: description, max: FIELD_LIMITS.description },
  });
  if (tooLong) return tooLong;

  const validPriorities = ['low', 'medium', 'high'];
  const validDifficulties = ['easy', 'medium', 'hard'];

  try {
    const db = getDatabase();

    // Subtask depth validation
    let resolvedParentTaskId: string | null = null;
    let resolvedDepth = 0;

    if (typeof parentTaskId === 'string' && parentTaskId.trim()) {
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
    if (typeof linkedEventId === 'string' && linkedEventId.trim()) {
      const [e] = await db.select({ id: events.id }).from(events)
        .where(and(eq(events.id, linkedEventId), eq(events.userId, userId))).limit(1);
      if (!e) return NextResponse.json({ error: 'linkedEventId not found' }, { status: 404 });
    }
    if (typeof linkedDocId === 'string' && linkedDocId.trim()) {
      const [d] = await db.select({ id: docs.id }).from(docs)
        .where(and(eq(docs.id, linkedDocId), eq(docs.userId, userId))).limit(1);
      if (!d) return NextResponse.json({ error: 'linkedDocId not found' }, { status: 404 });
    }
    if (typeof goalId === 'string' && goalId.trim()) {
      const [g] = await db.select({ id: goals.id }).from(goals)
        .where(and(eq(goals.id, goalId), eq(goals.userId, userId))).limit(1);
      if (!g) return NextResponse.json({ error: 'goalId not found' }, { status: 404 });
    }

    const [row] = await db
      .insert(tasks)
      .values({
        userId,
        title: title.trim(),
        description: description ?? null,
        status: normalizeTaskStatusForDb(status),
        priority: (validPriorities.includes(priority ?? '') ? priority : 'medium') as 'low' | 'medium' | 'high',
        difficulty: (validDifficulties.includes(difficulty ?? '') ? difficulty : 'medium') as 'easy' | 'medium' | 'hard',
        dueDate: dueDate ? new Date(dueDate) : null,
        estimatedMinutes: typeof durationMinutes === 'number' ? durationMinutes : 30,
        scheduledStart: normalizeTimeString(scheduledStart),
        scheduledEnd: normalizeTimeString(scheduledEnd),
        remainingFocusTime: normalizeRemainingFocusTime(remainingFocusTime),
        linkedEventId: typeof linkedEventId === 'string' && linkedEventId.trim() ? linkedEventId : null,
        linkedDocId: typeof linkedDocId === 'string' && linkedDocId.trim() ? linkedDocId : null,
        parentTaskId: resolvedParentTaskId,
        depth: resolvedDepth,
        goalId: typeof goalId === 'string' && goalId.trim() ? goalId : null,
        // Land a new task at the end of its column rather than sharing
        // position 0 with everything else. Computed in SQL so two concurrent
        // creates cannot read the same max.
        position: sql`coalesce((
          select max(t2.position) + 1 from ${tasks} t2
          where t2.user_id = ${userId} and t2.status = ${normalizeTaskStatusForDb(status)}
        ), 0)`,
      })
      .returning({ id: tasks.id });

    return NextResponse.json({ id: row.id }, { status: 201 });
  } catch (err) {
    logger.error('unhandled', { route: 'POST /api/tasks' }, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
