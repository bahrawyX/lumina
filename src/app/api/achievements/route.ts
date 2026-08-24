import { NextRequest, NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { achievements } from '@/db/schema';
import { getDatabase } from '@/lib/db';
import { logger } from '@/lib/logger';

/** GET /api/achievements — all achievements for the authenticated user */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getDatabase();
    const rows = await db
      .select({
        id: achievements.id,
        type: achievements.type,
        unlockedAt: achievements.unlockedAt,
        seen: achievements.seen,
      })
      .from(achievements)
      .where(eq(achievements.userId, session.user.id))
      .orderBy(desc(achievements.unlockedAt));

    return NextResponse.json(
      rows.map((r) => ({
        id: r.id,
        type: r.type,
        unlockedAt: r.unlockedAt.toISOString(),
        seen: r.seen,
      }))
    );
  } catch (err) {
    logger.error('unhandled', { route: 'GET /api/achievements' }, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** PATCH /api/achievements — mark achievements as seen */
export async function PATCH(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { ids?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: 'ids must be a non-empty array' }, { status: 400 });
  }

  try {
    const db = getDatabase();
    const { inArray, and } = await import('drizzle-orm');
    await db
      .update(achievements)
      .set({ seen: true })
      .where(
        and(
          eq(achievements.userId, session.user.id),
          inArray(achievements.id, body.ids),
        )
      );

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('unhandled', { route: 'PATCH /api/achievements' }, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
