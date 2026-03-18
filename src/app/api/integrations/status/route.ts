import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { integrations } from '@/db/schema';

/**
 * GET /api/integrations/status
 *
 * Returns the integration connection status for the authenticated user.
 * Used by the Sidebar to restore connected state after page reload.
 * Never returns tokens — only boolean connection state.
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDatabase();
  const rows = await db
    .select({
      provider: integrations.provider,
      status: integrations.status,
      expiresAt: integrations.expiresAt,
    })
    .from(integrations)
    .where(eq(integrations.userId, session.user.id));

  const now = new Date();

  const google = rows.find((r) => r.provider === 'google');
  const microsoft = rows.find(
    (r) => r.provider === 'microsoft' || r.provider === 'outlook',
  );

  return NextResponse.json({
    google: {
      connected: Boolean(google && google.status === 'active' && google.expiresAt > now),
    },
    microsoft: {
      connected: Boolean(
        microsoft && microsoft.status === 'active' && microsoft.expiresAt > now,
      ),
    },
  });
}
