import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { events } from '@/db/schema';
import { logger } from '@/lib/logger';

/**
 * POST /api/maintenance/cleanup-external-events
 *
 * Deletes all event rows whose provider is 'google', 'microsoft', or 'outlook'
 * for the authenticated user.  Local (Lumina-owned) events are untouched.
 *
 * Call this once after switching to the browser-cache-only external events
 * architecture to reclaim Neon DB row quota.
 *
 * Returns: { deleted: number }
 */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDatabase();

  try {
    const deleted = await db
      .delete(events)
      .where(
        and(
          eq(events.userId, session.user.id),
          inArray(events.provider, ['google', 'outlook']),
        ),
      )
      .returning({ id: events.id });

    return NextResponse.json({ ok: true, deleted: deleted.length });
  } catch (err) {
    logger.error('unhandled', { route: 'POST /api/maintenance/cleanup-external-events' }, err);
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
  }
}
