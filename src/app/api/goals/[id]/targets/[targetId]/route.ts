import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { goals, goalTargets } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '@/lib/logger';

interface RouteContext {
  params: Promise<{ id: string; targetId: string }>;
}

/** PATCH /api/goals/[id]/targets/[targetId] — update a target */
export async function PATCH(req: NextRequest, context: RouteContext) {
  const { id: goalId, targetId } = await context.params;
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

    // Verify goal ownership
    const [goal] = await db.select({ id: goals.id }).from(goals)
      .where(and(eq(goals.id, goalId), eq(goals.userId, userId)));
    if (!goal) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };

    if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim();
    if (typeof body.description === 'string') patch.description = body.description || null;
    if (typeof body.currentValue === 'number') patch.currentValue = String(body.currentValue);
    if (typeof body.targetValue === 'number') patch.targetValue = String(body.targetValue);
    if (typeof body.unit === 'string') patch.unit = body.unit || null;
    if (Array.isArray(body.linkedTaskIds)) {
      patch.linkedTaskIds = JSON.stringify(body.linkedTaskIds.filter((id: unknown) => typeof id === 'string'));
    }
    if (typeof body.order === 'number') patch.order = body.order;

    await db.update(goalTargets).set(patch).where(
      and(eq(goalTargets.id, targetId), eq(goalTargets.goalId, goalId))
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('unhandled', { route: 'PATCH /api/goals/[id]/targets/[targetId]' }, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE /api/goals/[id]/targets/[targetId] — hard delete target */
export async function DELETE(req: NextRequest, context: RouteContext) {
  const { id: goalId, targetId } = await context.params;
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const db = getDatabase();

    // Verify goal ownership
    const [goal] = await db.select({ id: goals.id }).from(goals)
      .where(and(eq(goals.id, goalId), eq(goals.userId, userId)));
    if (!goal) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    await db.delete(goalTargets).where(
      and(eq(goalTargets.id, targetId), eq(goalTargets.goalId, goalId))
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('unhandled', { route: 'DELETE /api/goals/[id]/targets/[targetId]' }, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
