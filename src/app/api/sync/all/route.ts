import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { integrations } from '@/db/schema';
import { runFullGoogleSync } from '@/lib/integrations/google/sync';
import { runFullMicrosoftSync } from '@/lib/integrations/microsoft/sync';
import type { FullSyncResult } from '@/lib/integrations/google/sync';
import type { MicrosoftSyncResult } from '@/lib/integrations/microsoft/sync';
import { createRateLimiter, rateLimitedResponse } from '@/lib/rateLimit';
import { integrationErrorCode } from '@/lib/integrations/clientError';
import { logger } from '@/lib/logger';

// TD-5: runs both providers' full syncs in parallel — the heaviest sync path.
// Give it the Vercel Hobby maximum so a large account can't time out mid-sync.
export const maxDuration = 60;

type ProviderResult<T> =
  | { ok: true; result: T }
  | { ok: false; error: string };

/**
 * POST /api/sync/all
 *
 * Runs Google and/or Outlook sync in parallel for the authenticated user.
 * - Only syncs providers that have an active integration row.
 * - Partial failure is safe: one provider failing does not block the other.
 * - Returns 200 if all succeeded, 207 if only some succeeded.
 *
 * Response: { google?, microsoft?, partial }
 */
/**
 * P1-10: a full sync fans out to every connected calendar with
 * `maxDuration = 60` and had NO limiter. Because the OAuth client is shared,
 * one account hammering this exhausts the provider quota for every user.
 *
 * 2 per 5 minutes is far above any legitimate manual refresh — the client also
 * coalesces through `singleFlight` — while making a hot loop pointless.
 */
const syncLimiter = createRateLimiter('syncAll', { windowMs: 5 * 60_000, max: 2 });

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
  const db = getDatabase();

  const userIntegrations = await db
    .select({ provider: integrations.provider, status: integrations.status })
    .from(integrations)
    .where(eq(integrations.userId, userId));

  const hasGoogle = userIntegrations.some(
    (i) => i.provider === 'google' && i.status === 'active',
  );
  const hasMicrosoft = userIntegrations.some(
    (i) =>
      (i.provider === 'microsoft' || i.provider === 'outlook') &&
      i.status === 'active',
  );

  if (!hasGoogle && !hasMicrosoft) {
    return NextResponse.json(
      { error: 'No active calendar integrations connected.' },
      { status: 404 },
    );
  }

  const results: {
    google?: ProviderResult<FullSyncResult>;
    microsoft?: ProviderResult<MicrosoftSyncResult>;
  } = {};

  // Run both providers in parallel; catch each independently
  await Promise.all([
    hasGoogle
      ? runFullGoogleSync(userId)
          .then((r) => { results.google = { ok: true, result: r }; })
          .catch((err) => {
            // P3-3: the client gets a safe enum — but `err` used to be
            // discarded entirely here, so the actual provider failure was
            // recorded nowhere at all. Half of that finding is not leaking the
            // detail; the other half is still HAVING it.
            logger.error('unhandled', { route: 'POST /api/sync/all', provider: 'google' }, err);
            results.google = {
              ok: false,
              error: integrationErrorCode(err),
            };
          })
      : Promise.resolve(),

    hasMicrosoft
      ? runFullMicrosoftSync(userId)
          .then((r) => { results.microsoft = { ok: true, result: r }; })
          .catch((err) => {
            logger.error('unhandled', { route: 'POST /api/sync/all', provider: 'microsoft' }, err);
            results.microsoft = {
              ok: false,
              error: integrationErrorCode(err),
            };
          })
      : Promise.resolve(),
  ]);

  const allOk = Object.values(results).every((r) => r?.ok === true);
  const anyFailed = Object.values(results).some((r) => r?.ok === false);

  return NextResponse.json(
    { ok: allOk, partial: anyFailed, ...results },
    { status: allOk ? 200 : 207 },
  );
}
