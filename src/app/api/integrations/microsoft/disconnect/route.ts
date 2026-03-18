import { NextRequest, NextResponse } from 'next/server';
import { and, eq, or } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { integrations } from '@/db/schema';

/**
 * POST /api/integrations/microsoft/disconnect
 *
 * Removes the Microsoft/Outlook integration row for the authenticated user.
 * Historical events are preserved in the `events` table.
 * Future sync attempts will return 403 until the user reconnects.
 */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDatabase();
  await db
    .delete(integrations)
    .where(
      and(
        eq(integrations.userId, session.user.id),
        or(
          eq(integrations.provider, 'microsoft'),
          eq(integrations.provider, 'outlook'),
        ),
      ),
    );

  return NextResponse.json({ ok: true });
}
