import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { moodLogs, focusSessions } from '@/db/schema';
import { moodSchema } from '@/lib/validation';
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 30));

  try {
    const db = getDatabase();
    const rows = await db
      .select()
      .from(moodLogs)
      .where(eq(moodLogs.userId, session.user.id))
      .orderBy(desc(moodLogs.loggedAt))
      .limit(limit);

    return NextResponse.json(
      rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        focusSessionId: r.focusSessionId,
        mood: r.mood,
        note: r.note,
        loggedAt: r.loggedAt.toISOString(),
      })),
    );
  } catch (err) {
    logger.error('unhandled', { route: 'GET /api/mood-logs' }, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const moodResult = moodSchema.safeParse(body.mood);
  if (!moodResult.success) {
    return NextResponse.json({ error: 'Invalid mood value' }, { status: 400 });
  }

  const note = typeof body.note === 'string' && body.note.trim()
    ? body.note.trim().slice(0, 140)
    : null;

  const focusSessionId = typeof body.focusSessionId === 'string' && body.focusSessionId
    ? body.focusSessionId
    : null;

  try {
    const db = getDatabase();

    // Batch 5 (FK ownership on create): only the caller's own focus session may
    // be referenced.
    if (focusSessionId) {
      const [fs] = await db.select({ id: focusSessions.id }).from(focusSessions)
        .where(and(eq(focusSessions.id, focusSessionId), eq(focusSessions.userId, session.user.id))).limit(1);
      if (!fs) return NextResponse.json({ error: 'focusSessionId not found' }, { status: 404 });
    }

    const [row] = await db
      .insert(moodLogs)
      .values({
        userId: session.user.id,
        focusSessionId,
        mood: moodResult.data,
        note,
      })
      .returning({ id: moodLogs.id });

    return NextResponse.json({ id: row.id }, { status: 201 });
  } catch (err) {
    logger.error('unhandled', { route: 'POST /api/mood-logs' }, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
