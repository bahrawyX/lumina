import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { plannerItems } from '@/db/schema';
import { eq } from 'drizzle-orm';

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

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const db = getDatabase();
    const rows = await db
      .select()
      .from(plannerItems)
      .where(eq(plannerItems.userId, userId))
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

    return NextResponse.json({ id: row.id }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/planner-items]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
