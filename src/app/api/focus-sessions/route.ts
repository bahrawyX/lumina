import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { focusSessions } from '@/db/schema';
import { eq } from 'drizzle-orm';

/** GET /api/focus-sessions — return session history for the authenticated user */
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
      .from(focusSessions)
      .where(eq(focusSessions.userId, userId))
      .orderBy(focusSessions.startTime);

    const mapped = rows.map((row) => ({
      id: row.id,
      taskId: row.taskId ?? '',
      taskTitle: '',            // not stored in DB — client fills from task store
      startTime: row.startTime.toISOString(),
      endTime: row.endTime.toISOString(),
      duration: row.durationMinutes * 60,
      completed: true,
    }));

    return NextResponse.json(mapped);
  } catch (err) {
    console.error('[GET /api/focus-sessions]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST /api/focus-sessions — record a completed/cancelled session */
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

  const { startTime, endTime, duration } = body as {
    startTime?: string;
    endTime?: string;
    duration?: number;
  };

  if (!startTime || !endTime || typeof duration !== 'number' || duration < 1) {
    return NextResponse.json({ error: 'startTime, endTime, and duration are required' }, { status: 400 });
  }

  const startTs = new Date(startTime);
  const endTs = new Date(endTime);

  if (isNaN(startTs.getTime()) || isNaN(endTs.getTime()) || endTs <= startTs) {
    return NextResponse.json({ error: 'Invalid timestamps' }, { status: 400 });
  }

  const durationMinutes = Math.max(1, Math.round(duration / 60));

  try {
    const db = getDatabase();
    const [row] = await db
      .insert(focusSessions)
      .values({
        userId,
        taskId: typeof body.taskId === 'string' && body.taskId ? body.taskId : null,
        startTime: startTs,
        endTime: endTs,
        durationMinutes,
      })
      .returning({ id: focusSessions.id });

    return NextResponse.json({ id: row.id }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/focus-sessions]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
