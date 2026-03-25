import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { tasks } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

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

/** PATCH /api/tasks/[id] — update a task (ownership enforced) */
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

    await db
      .update(tasks)
      .set(patch)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));

    return NextResponse.json({ ok: true });
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
