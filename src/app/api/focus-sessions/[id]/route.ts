import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { focusSessions } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { apiError } from '@/lib/logger';
import { invalidIdResponse, parseRouteId } from '@/lib/routeParams';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** DELETE /api/focus-sessions/[id] — delete a session record (ownership enforced) */
export async function DELETE(req: NextRequest, context: RouteContext) {
  const { id: rawId } = await context.params;
  // P2-1: every PK is a uuid and this went straight into `eq(table.id, id)`,
  // so Postgres raised 22P02 and the client got a generic 500.
  const id = parseRouteId(rawId);
  if (!id) return invalidIdResponse();
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const db = getDatabase();
    const deleted = await db
      .delete(focusSessions)
      .where(and(eq(focusSessions.id, id), eq(focusSessions.userId, userId)))
      .returning({ id: focusSessions.id });

    // P2-2: the write was issued and success returned unconditionally, so a
    // request for a nonexistent (or another user's) id answered 200 {ok:true}.
    // Ownership is enforced by the WHERE, so this was never a security hole —
    // but the client could not distinguish a lost write from a real one.
    if (deleted.length === 0) {
      return NextResponse.json({ error: 'Focus session not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError('DELETE /api/focus-sessions/[id]', err);
  }
}
