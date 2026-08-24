import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { runFullMicrosoftSync } from '@/lib/integrations/microsoft/sync';
import { logger } from '@/lib/logger';

// TD-5: full sync is a multi-calendar, paginated calendarView fetch; give it the
// Vercel Hobby maximum instead of the lower platform default so it can't time out.
export const maxDuration = 60;

/**
 * POST /api/sync/outlook
 *
 * Triggers a full Outlook Calendar sync for the authenticated user.
 * - Imports calendars from Microsoft Graph into the `calendars` table.
 * - Fetches events via calendarView (90-day past → 365-day future).
 * - Upserts events into the `events` table with etag-based smart skip.
 * - Marks integration lastSyncAt on success.
 *
 * Response: { ok, calendarsImported, eventsInserted, eventsUpdated, eventsSkipped }
 */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runFullMicrosoftSync(session.user.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Outlook sync failed';
    logger.error('unhandled', { route: 'POST /api/sync/outlook' }, message);

    if (
      message.includes('No Microsoft integration found') ||
      message.includes('not active') ||
      message.includes('refresh token missing')
    ) {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    return NextResponse.json(
      { error: 'Outlook Calendar sync failed' },
      { status: 500 },
    );
  }
}
