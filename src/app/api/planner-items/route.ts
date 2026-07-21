import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { plannerItems, tasks } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { awardCoins } from '@/lib/coins/awardCoins';
import { scopeAward, utcDateKey } from '@/lib/coins/dedupeKeys';

// ── Validation ───────────────────────────────────────────────────────────────

const createSchema = z.object({
  taskId: z.string().uuid('taskId must be a UUID'),
  startTime: z.string().datetime({ message: 'startTime must be ISO 8601' }),
  endTime: z.string().datetime({ message: 'endTime must be ISO 8601' }),
  isAutoScheduled: z.boolean().optional().default(false),
}).refine((d) => new Date(d.endTime) > new Date(d.startTime), {
  message: 'endTime must be after startTime',
  path: ['endTime'],
});

// ── GET /api/planner-items ────────────────────────────────────────────────────

const DATE_PARAM_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  // Optional ?date=YYYY-MM-DD filter — narrows the result to a single local
  // calendar day. The DB stores timestamps in UTC; we compute the day's bounds
  // in the server's local timezone (matches how the API already serializes
  // start/end times), which is consistent with how the client groups items
  // into plansByDate.
  const url = new URL(req.url);
  const dateParam = url.searchParams.get('date');
  let startBound: Date | null = null;
  let endBound: Date | null = null;
  if (dateParam) {
    if (!DATE_PARAM_RE.test(dateParam)) {
      return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
    }
    const [y, m, d] = dateParam.split('-').map(Number);
    startBound = new Date(y, m - 1, d, 0, 0, 0, 0);
    endBound = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
  }

  try {
    const db = getDatabase();
    const conditions = [eq(plannerItems.userId, userId)];
    if (startBound && endBound) {
      conditions.push(sql`${plannerItems.startTime} >= ${startBound}`);
      conditions.push(sql`${plannerItems.startTime} < ${endBound}`);
    }

    const rows = await db
      .select()
      .from(plannerItems)
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .orderBy(plannerItems.startTime);

    const mapped = rows.map((row) => ({
      id: row.id,
      taskId: row.taskId,
      startTime: row.startTime.toISOString(),
      endTime: row.endTime.toISOString(),
      isAutoScheduled: row.isAutoScheduled,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));

    return NextResponse.json(mapped);
  } catch (err) {
    console.error('[GET /api/planner-items]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── POST /api/planner-items ───────────────────────────────────────────────────

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

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { taskId, startTime, endTime, isAutoScheduled } = parsed.data;

  try {
    const db = getDatabase();

    // Batch 5 (M2): the planner item must reference a task the caller OWNS.
    // Without this, a user can attach another user's task to their planner and
    // leak its title through the daily-brief / intelligence joins.
    const [ownedTask] = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
      .limit(1);
    if (!ownedTask) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const [row] = await db
      .insert(plannerItems)
      .values({
        userId,
        taskId,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        isAutoScheduled,
      })
      .returning({ id: plannerItems.id });

    // Award coins when user plans 3 tasks for today. Awaited so the
    // response carries the post-award balance.
    let newBalance: number | undefined;
    try {
      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const todayEnd = new Date(todayStart);
      todayEnd.setDate(todayEnd.getDate() + 1);

      const items = await db.select({ id: plannerItems.id }).from(plannerItems)
        .where(and(
          eq(plannerItems.userId, userId),
          sql`${plannerItems.startTime} >= ${todayStart}`,
          sql`${plannerItems.startTime} < ${todayEnd}`
        ));

      if (items.length === 3) {
        // Idempotent via ledger key `planner_day:<utc-date>` — no check-then-award race (M1).
        const entry = scopeAward(
          { amount: 15, reason: 'planner_day', label: 'Planned your day' },
          { utcDate: utcDateKey(new Date()) },
        );
        const res = await awardCoins(userId, [entry]);
        newBalance = res.newBalance;
      }
    } catch (e) {
      console.error('[planner coin award]', e);
    }

    return NextResponse.json({ id: row.id, newBalance }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/planner-items]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
