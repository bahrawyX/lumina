import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { goals, goalTargets } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { awardCoins } from '@/lib/coins/awardCoins';
import { goalCreatedAward } from '@/lib/coins/earnRules';

function parseLinkedTaskIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id: unknown) => typeof id === 'string') : [];
  } catch { return []; }
}

function mapTarget(row: typeof goalTargets.$inferSelect) {
  return {
    id: row.id,
    goalId: row.goalId,
    title: row.title,
    description: row.description ?? undefined,
    type: row.type,
    currentValue: Number(row.currentValue),
    targetValue: Number(row.targetValue),
    unit: row.unit ?? undefined,
    linkedTaskIds: parseLinkedTaskIds(row.linkedTaskIds),
    order: row.order,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** GET /api/goals — return all goals with targets for authenticated user */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;
  const statusFilter = req.nextUrl.searchParams.get('status');

  try {
    const db = getDatabase();

    // Fetch goals
    const goalRows = await db
      .select()
      .from(goals)
      .where(eq(goals.userId, userId))
      .orderBy(goals.endDate);

    // Fetch all targets for this user's goals in one query
    const goalIds = goalRows.map(g => g.id);
    let targetRows: (typeof goalTargets.$inferSelect)[] = [];
    if (goalIds.length > 0) {
      // Fetch targets for all goals (IN query)
      const allTargets = await db.select().from(goalTargets).orderBy(goalTargets.order);
      targetRows = allTargets.filter(t => goalIds.includes(t.goalId));
    }

    // Group targets by goalId
    const targetMap = new Map<string, typeof targetRows>();
    targetRows.forEach(t => {
      const arr = targetMap.get(t.goalId) ?? [];
      arr.push(t);
      targetMap.set(t.goalId, arr);
    });

    const mapped = goalRows
      .filter(g => !statusFilter || g.status === statusFilter)
      .map(row => ({
        id: row.id,
        title: row.title,
        description: row.description ?? undefined,
        emoji: row.emoji ?? undefined,
        color: row.color ?? undefined,
        status: row.status,
        timeframe: row.timeframe,
        startDate: row.startDate.toISOString().slice(0, 10),
        endDate: row.endDate.toISOString().slice(0, 10),
        targets: (targetMap.get(row.id) ?? []).map(mapTarget),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      }));

    return NextResponse.json(mapped);
  } catch (err) {
    console.error('[GET /api/goals]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST /api/goals — create a goal with optional targets */
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

  const { title, description, emoji, color, timeframe, startDate, endDate, targets } = body as {
    title?: string;
    description?: string;
    emoji?: string;
    color?: string;
    timeframe?: string;
    startDate?: string;
    endDate?: string;
    targets?: Array<{
      title: string;
      type: string;
      targetValue: number;
      unit?: string;
      linkedTaskIds?: string[];
    }>;
  };

  if (!title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }
  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 });
  }
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
  }
  if (end <= start) {
    return NextResponse.json({ error: 'endDate must be after startDate' }, { status: 400 });
  }

  const validTimeframes = ['weekly', 'monthly', 'quarterly', 'yearly', 'custom'];
  const validColors = ['blue', 'green', 'purple', 'orange', 'red'];
  const validTargetTypes = ['number', 'percentage', 'boolean', 'task_completion'];

  try {
    const db = getDatabase();

    const result = await db.transaction(async (tx) => {
      const [goalRow] = await tx.insert(goals).values({
        userId,
        title: title.trim(),
        description: description ?? null,
        emoji: emoji ?? null,
        color: validColors.includes(color ?? '') ? color! : null,
        timeframe: (validTimeframes.includes(timeframe ?? '') ? timeframe : 'custom') as 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom',
        startDate: start,
        endDate: end,
      }).returning({ id: goals.id });

      const createdTargets: string[] = [];
      if (Array.isArray(targets)) {
        for (let i = 0; i < targets.length; i++) {
          const t = targets[i];
          if (!t.title?.trim() || !validTargetTypes.includes(t.type)) continue;
          const [targetRow] = await tx.insert(goalTargets).values({
            goalId: goalRow.id,
            title: t.title.trim(),
            type: t.type as 'number' | 'percentage' | 'boolean' | 'task_completion',
            targetValue: String(t.targetValue ?? (t.type === 'boolean' ? 1 : 100)),
            unit: t.unit ?? null,
            linkedTaskIds: Array.isArray(t.linkedTaskIds) ? JSON.stringify(t.linkedTaskIds) : null,
            order: i,
          }).returning({ id: goalTargets.id });
          createdTargets.push(targetRow.id);
        }
      }

      return { goalId: goalRow.id, targetIds: createdTargets };
    });

    // Award coins for creating a goal (fire-and-forget)
    const award = goalCreatedAward();
    void awardCoins(userId, award.amount, award.reason, award.label).catch(() => {});

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error('[POST /api/goals]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
