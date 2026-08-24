import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { goals, goalTargets } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '@/lib/logger';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** POST /api/goals/[id]/targets — add a target to a goal */
export async function POST(req: NextRequest, context: RouteContext) {
  const { id: goalId } = await context.params;
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

  const { title, description, type, targetValue, unit, linkedTaskIds } = body as {
    title?: string;
    description?: string;
    type?: string;
    targetValue?: number;
    unit?: string;
    linkedTaskIds?: string[];
  };

  if (!title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  const validTypes = ['number', 'percentage', 'boolean', 'task_completion'];
  if (!type || !validTypes.includes(type)) {
    return NextResponse.json({ error: 'Invalid target type' }, { status: 400 });
  }

  try {
    const db = getDatabase();

    // Verify goal ownership
    const [goal] = await db.select({ id: goals.id }).from(goals)
      .where(and(eq(goals.id, goalId), eq(goals.userId, userId)));
    if (!goal) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    // Get max order
    const existingTargets = await db.select({ order: goalTargets.order }).from(goalTargets)
      .where(eq(goalTargets.goalId, goalId));
    const maxOrder = existingTargets.length > 0 ? Math.max(...existingTargets.map(t => t.order)) : -1;

    const [row] = await db.insert(goalTargets).values({
      goalId,
      title: title.trim(),
      description: description ?? null,
      type: type as 'number' | 'percentage' | 'boolean' | 'task_completion',
      targetValue: String(targetValue ?? (type === 'boolean' ? 1 : 100)),
      unit: unit ?? null,
      linkedTaskIds: Array.isArray(linkedTaskIds) ? JSON.stringify(linkedTaskIds) : null,
      order: maxOrder + 1,
    }).returning({ id: goalTargets.id });

    return NextResponse.json({ id: row.id }, { status: 201 });
  } catch (err) {
    logger.error('unhandled', { route: 'POST /api/goals/[id]/targets' }, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
