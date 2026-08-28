import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { plannerItems, tasks } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { awardCoins } from '@/lib/coins/awardCoins';
import { scopeAward, utcDateKey } from '@/lib/coins/dedupeKeys';
import { apiError, logger } from '@/lib/logger';
import { getUserTimeZone } from '@/lib/time/eventTimeZone';
import { userDayBounds } from '@/lib/time/userDay';
import { zonedDayBounds } from '@/lib/time/zonedTime';

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

  // Optional ?date=YYYY-MM-DD filter — narrows the result to a single calendar
  // day. The DB stores instants; the day's bounds depend on WHERE THE USER IS.
  //
  // P2-8: this used `new Date(y, m - 1, d)`, which resolves in the SERVER's
  // zone — UTC on Vercel. The original comment said "the server's local
  // timezone (matches how the API already serializes start/end times)", which
  // was an accurate description of a bug: a user in UTC-8 asking for the 3rd
  // got 16:00 on the 2nd through 16:00 on the 3rd, so the evening of their day
  // was missing and the previous evening was included.
  const url = new URL(req.url);
  const dateParam = url.searchParams.get('date');
  if (dateParam && !DATE_PARAM_RE.test(dateParam)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
  }

  try {
    const db = getDatabase();

    let startBound: Date | null = null;
    let endBound: Date | null = null;
    if (dateParam) {
      const zone = await getUserTimeZone(db, userId);
      const bounds = zonedDayBounds(dateParam, zone);
      if (!bounds) {
        return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
      }
      startBound = bounds.start;
      endBound = bounds.end;
    }

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
    return apiError('GET /api/planner-items', err);
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
      // P2-8: `new Date(y, m, d)` is the SERVER's midnight. "Planned 3 tasks
      // for today" was counted against a day that did not line up with the
      // user's, so the award fired on the wrong side of their evening.
      const day = await userDayBounds(db, userId);

      const items = await db.select({ id: plannerItems.id }).from(plannerItems)
        .where(and(
          eq(plannerItems.userId, userId),
          sql`${plannerItems.startTime} >= ${day.start}`,
          sql`${plannerItems.startTime} < ${day.end}`
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
      logger.error('unhandled', { route: 'planner coin award' }, e);
    }

    return NextResponse.json({ id: row.id, newBalance }, { status: 201 });
  } catch (err) {
    return apiError('POST /api/planner-items', err);
  }
}
