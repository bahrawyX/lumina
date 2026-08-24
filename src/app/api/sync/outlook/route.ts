import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { runFullMicrosoftSync } from '@/lib/integrations/microsoft/sync';
import { logger } from '@/lib/logger';
import { createRateLimiter, rateLimitedResponse } from '@/lib/rateLimit';
import { integrationErrorCode } from '@/lib/integrations/clientError';

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
/**
 * P1-10: a full sync fans out to every connected calendar with
 * `maxDuration = 60` and had NO limiter. Because the OAuth client is shared,
 * one account hammering this exhausts the provider quota for every user.
 *
 * 2 per 5 minutes is far above any legitimate manual refresh — the client also
 * coalesces through `singleFlight` — while making a hot loop pointless.
 */
const syncLimiter = createRateLimiter('syncOutlook', { windowMs: 5 * 60_000, max: 2 });

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  const limit = await syncLimiter.check(userId);
  if (limit.limited) {
    return rateLimitedResponse(limit.retryAfterMs, 'Sync already ran recently.');
  }

  try {
    const result = await runFullMicrosoftSync(userId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Outlook sync failed';
    logger.error('unhandled', { route: 'POST /api/sync/outlook' }, message);

    // P3-3: see sync/google — the raw provider message never reaches the client.
    const code = integrationErrorCode(err, message);
    if (code === 'not_connected' || code === 'reconnect_required') {
      return NextResponse.json({ error: code, provider: 'microsoft' }, { status: 403 });
    }
    if (code === 'rate_limited' || code === 'provider_unavailable') {
      return NextResponse.json({ error: code, provider: 'microsoft' }, { status: 503 });
    }

    return NextResponse.json({ error: 'provider_error', provider: 'microsoft' }, { status: 500 });
  }
}
