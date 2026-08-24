import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { runFullGoogleSync } from '@/lib/integrations/google/sync';
import { logger } from '@/lib/logger';
import { createRateLimiter, rateLimitedResponse } from '@/lib/rateLimit';
import { integrationErrorCode } from '@/lib/integrations/clientError';

// TD-5: full sync is a multi-calendar, paginated fetch; give it the Vercel Hobby
// maximum instead of the lower platform default so it can't time out mid-sync.
export const maxDuration = 60;

/**
 * POST /api/sync/google
 * Convenience alias for a full Google Calendar sync.
 * Delegates to /api/integrations/google/events/sync (full mode).
 */
/**
 * P1-10: a full sync fans out to every connected calendar with
 * `maxDuration = 60` and had NO limiter. Because the OAuth client is shared,
 * one account hammering this exhausts the provider quota for every user.
 *
 * 2 per 5 minutes is far above any legitimate manual refresh — the client also
 * coalesces through `singleFlight` — while making a hot loop pointless.
 */
const syncLimiter = createRateLimiter('syncGoogle', { windowMs: 5 * 60_000, max: 2 });

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
    const result = await runFullGoogleSync(userId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('unhandled', { route: 'POST /api/sync/google' }, message);

    // P3-3: this returned `err.message` verbatim, which reads like
    // `[google/client] API 403 at <url>: <full response body>` — leaking
    // internal paths and provider diagnostics to the client. The detail stays
    // in the structured log above; the client gets a code it can act on.
    const code = integrationErrorCode(err, message);
    if (code === 'not_connected' || code === 'reconnect_required') {
      return NextResponse.json({ error: code, provider: 'google' }, { status: 403 });
    }
    if (code === 'rate_limited' || code === 'provider_unavailable') {
      return NextResponse.json({ error: code, provider: 'google' }, { status: 503 });
    }

    return NextResponse.json({ error: 'provider_error', provider: 'google' }, { status: 500 });
  }
}
