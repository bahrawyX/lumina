import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { calendars } from '@/db/schema';
import { logger } from '@/lib/logger';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/integrations/calendars/[id]
 * Updates enabled state for a persisted external calendar.
 */
export async function PATCH(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { enabled?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 });
  }

  try {
    const db = getDatabase();
    const [updated] = await db
      .update(calendars)
      .set({ enabled: body.enabled, updatedAt: new Date() })
      .where(
        and(
          eq(calendars.id, id),
          eq(calendars.userId, session.user.id),
          inArray(calendars.provider, ['google', 'microsoft']),
        ),
      )
      .returning({
        id: calendars.id,
        provider: calendars.provider,
        name: calendars.name,
        color: calendars.color,
        enabled: calendars.enabled,
      });

    if (!updated) {
      return NextResponse.json({ error: 'Calendar not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, calendar: updated });
  } catch (err) {
    logger.error('unhandled', { route: 'PATCH /api/integrations/calendars/[id]' }, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
