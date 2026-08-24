import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { focusSessions } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '@/lib/logger';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** DELETE /api/focus-sessions/[id] — delete a session record (ownership enforced) */
export async function DELETE(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const db = getDatabase();
    await db
      .delete(focusSessions)
      .where(and(eq(focusSessions.id, id), eq(focusSessions.userId, userId)));

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('unhandled', { route: 'DELETE /api/focus-sessions/[id]' }, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
