import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { calendars } from '@/db/schema';

/**
 * GET /api/integrations/calendars
 * Returns persisted external calendars (Google + Microsoft) with enabled state.
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getDatabase();
    const rows = await db
      .select({
        id: calendars.id,
        provider: calendars.provider,
        name: calendars.name,
        color: calendars.color,
        enabled: calendars.enabled,
        isPrimary: calendars.isPrimary,
      })
      .from(calendars)
      .where(
        and(
          eq(calendars.userId, session.user.id),
          inArray(calendars.provider, ['google', 'microsoft']),
        ),
      )
      .orderBy(asc(calendars.provider), asc(calendars.name));

    return NextResponse.json({ calendars: rows });
  } catch (err) {
    console.error('[GET /api/integrations/calendars]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
