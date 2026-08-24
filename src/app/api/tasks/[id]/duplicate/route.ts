import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { tasks } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '@/lib/logger';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** POST /api/tasks/[id]/duplicate — duplicate a task (no body needed) */
export async function POST(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const db = getDatabase();

    // Fetch original (verify ownership)
    const [original] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
      .limit(1);

    if (!original) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Insert duplicate — copy fields with overrides per spec
    const [row] = await db
      .insert(tasks)
      .values({
        userId,
        title: `${original.title} (copy)`,
        description: original.description,
        status: 'todo',                   // always reset
        priority: original.priority,
        difficulty: original.difficulty ?? 'medium',
        estimatedMinutes: original.estimatedMinutes,
        dueDate: original.dueDate,
        scheduledStart: null,
        scheduledEnd: null,
        remainingFocusTime: null,
        linkedEventId: null,              // don't copy event link
        linkedDocId: null,                // don't copy doc link
        parentTaskId: null,               // duplicates always become root tasks
        depth: 0,
      })
      .returning();

    return NextResponse.json({
      id: row.id,
      title: row.title,
      description: row.description ?? undefined,
      status: row.status,
      dbStatus: row.status,
      priority: row.priority,
      difficulty: row.difficulty,
      dueDate: row.dueDate ? row.dueDate.toISOString().slice(0, 10) : null,
      durationMinutes: row.estimatedMinutes,
      scheduledStart: row.scheduledStart ?? null,
      scheduledEnd: row.scheduledEnd ?? null,
      remainingFocusTime: row.remainingFocusTime ?? null,
      order: 0,
      context: null,
      linkedEventId: null,
      parentTaskId: null,
      depth: 0,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }, { status: 201 });
  } catch (err) {
    logger.error('unhandled', { route: 'POST /api/tasks/[id]/duplicate' }, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
