import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { moodLogs, focusSessions } from '@/db/schema';
import { parseBody } from '@/lib/api/parseBody';
import { createMoodLogSchema } from '@/lib/api/schemas';
import { apiError } from '@/lib/logger';

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
    return apiError('GET /api/mood-logs', err);
  }
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = await parseBody(req, createMoodLogSchema);
  if (!parsed.ok) return parsed.response;

  /**
   * The note is no longer silently truncated.
   *
   * It used to be `.slice(0, 140)`. `MoodAnalysisCard` lets a person type 200
   * characters and `mood_logs.note` is an unbounded `text` column, so the last
   * 60 characters of a reflection were discarded on the way to a database that
   * would happily have stored them — with a 201 and no indication anything had
   * been dropped.
   *
   * The schema caps at 200 to match the most permissive input in the UI, and
   * anything longer is now a 400 that says so rather than a quiet trim.
   */
  const note = parsed.data.note?.trim() ? parsed.data.note.trim() : null;
  const focusSessionId = parsed.data.focusSessionId ?? null;
  const mood = parsed.data.mood;

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
        mood,
        note,
      })
      .returning({ id: moodLogs.id });

    return NextResponse.json({ id: row.id }, { status: 201 });
  } catch (err) {
    return apiError('POST /api/mood-logs', err);
  }
}
