import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { tasks, events } from '@/db/schema';
import { logger } from '@/lib/logger';

const linkSchema = z.object({
  taskId: z.string().uuid(),
  eventId: z.string().uuid(),
});

/** POST /api/link — atomically link a task and event bidirectionally */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = linkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'taskId and eventId must be valid UUIDs' }, { status: 400 });
  }
  const { taskId, eventId } = parsed.data;

  try {
    const db = getDatabase();

    // Verify ownership of both resources
    const [task] = await db
      .select({ id: tasks.id, linkedEventId: tasks.linkedEventId })
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
      .limit(1);

    if (!task) {
      return NextResponse.json({ error: 'Task not found or not owned by user' }, { status: 404 });
    }

    const [event] = await db
      .select({ id: events.id, linkedTaskId: events.linkedTaskId })
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.userId, userId)))
      .limit(1);

    if (!event) {
      return NextResponse.json({ error: 'Event not found or not owned by user' }, { status: 404 });
    }

    // Check neither is already linked to something else
    if (task.linkedEventId && task.linkedEventId !== eventId) {
      return NextResponse.json(
        { error: 'Task is already linked. Unlink first.' },
        { status: 409 },
      );
    }
    if (event.linkedTaskId && event.linkedTaskId !== taskId) {
      return NextResponse.json(
        { error: 'Event is already linked. Unlink first.' },
        { status: 409 },
      );
    }

    // Atomic transaction: set both sides
    await db.transaction(async (tx) => {
      await tx
        .update(tasks)
        .set({ linkedEventId: eventId, updatedAt: new Date() })
        .where(eq(tasks.id, taskId));
      await tx
        .update(events)
        .set({ linkedTaskId: taskId, updatedAt: new Date() })
        .where(eq(events.id, eventId));
    });

    return NextResponse.json({ ok: true, taskId, eventId }, { status: 200 });
  } catch (err) {
    logger.error('unhandled', { route: 'POST /api/link' }, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE /api/link — atomically unlink a task and event bidirectionally */
export async function DELETE(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = linkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'taskId and eventId must be valid UUIDs' }, { status: 400 });
  }
  const { taskId, eventId } = parsed.data;

  try {
    const db = getDatabase();

    // Verify ownership of both resources
    const [task] = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
      .limit(1);

    if (!task) {
      return NextResponse.json({ error: 'Task not found or not owned by user' }, { status: 404 });
    }

    const [event] = await db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.userId, userId)))
      .limit(1);

    if (!event) {
      return NextResponse.json({ error: 'Event not found or not owned by user' }, { status: 404 });
    }

    // Atomic transaction: clear both sides
    await db.transaction(async (tx) => {
      await tx
        .update(tasks)
        .set({ linkedEventId: null, updatedAt: new Date() })
        .where(eq(tasks.id, taskId));
      await tx
        .update(events)
        .set({ linkedTaskId: null, updatedAt: new Date() })
        .where(eq(events.id, eventId));
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    logger.error('unhandled', { route: 'DELETE /api/link' }, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
